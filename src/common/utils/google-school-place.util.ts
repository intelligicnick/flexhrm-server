import { localityHintFromSchoolName } from './reverse-geocode.util';

export type SchoolPlaceConfidence = 'exact' | 'partial' | 'village' | 'not_found';

export type ResolvedSchoolPlace = {
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  googlePlaceId: string;
  googleMapsUrl: string;
  locationSource: 'google_places' | 'google_geocode' | 'village_fallback';
  locationConfidence: SchoolPlaceConfidence;
  geofenceRadiusM: number;
  queryUsed: string;
};

export const SCHOOL_GEOFENCE_EXACT_M = 100;
export const SCHOOL_GEOFENCE_VILLAGE_M = 400;
export const VISIT_MAX_GPS_ACCURACY_M = 50;

export function isGooglePlacesConfigured(): boolean {
  return Boolean(
    String(
      process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || '',
    ).trim(),
  );
}

function buildGoogleMapsUrl(lat: number, lng: number, placeId?: string): string {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function normalizeSchoolQuery(
  schoolName: string,
  block: string,
  district: string,
  udise?: string,
): string {
  const parts = [
    schoolName.trim(),
    block.trim(),
    district.trim(),
    'Bihar',
    'India',
  ].filter(Boolean);
  const base = parts.join(', ');
  const code = String(udise || '').trim();
  return code ? `${base} UDISE ${code}` : base;
}

function buildSchoolQueries(
  schoolName: string,
  block: string,
  district: string,
  udise?: string,
): string[] {
  const base = normalizeSchoolQuery(schoolName, block, district);
  const withUdise = udise
    ? normalizeSchoolQuery(schoolName, block, district, udise)
    : '';
  return [...new Set([base, withUdise].filter(Boolean))];
}

function looksLikeSchool(types: string[] | undefined): boolean {
  if (!types?.length) return false;
  const schoolish = new Set([
    'school',
    'primary_school',
    'secondary_school',
    'university',
    'establishment',
    'point_of_interest',
  ]);
  return types.some((t) => schoolish.has(t));
}

async function searchGooglePlaces(
  textQuery: string,
  apiKey: string,
): Promise<{
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  placeId: string;
  types: string[];
} | null> {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      },
      body: JSON.stringify({ textQuery, languageCode: 'en' }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        types?: string[];
      }>;
    };
    const place = data.places?.[0];
    if (!place?.location) return null;
    const lat = Number(place.location.latitude);
    const lng = Number(place.location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      placeName: String(place.displayName?.text || '').trim(),
      formattedAddress: String(place.formattedAddress || '').trim(),
      placeId: String(place.id || '').trim(),
      types: Array.isArray(place.types) ? place.types : [],
    };
  } catch {
    return null;
  }
}

async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    if (data.status !== 'OK' || !data.results?.length) return null;
    const result = data.results[0];
    const lat = Number(result.geometry?.location?.lat);
    const lng = Number(result.geometry?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      formattedAddress: String(result.formatted_address || '').trim(),
    };
  } catch {
    return null;
  }
}

function toResolvedPlace(
  lat: number,
  lng: number,
  placeName: string,
  formattedAddress: string,
  googlePlaceId: string,
  locationSource: ResolvedSchoolPlace['locationSource'],
  locationConfidence: SchoolPlaceConfidence,
  queryUsed: string,
): ResolvedSchoolPlace {
  return {
    lat,
    lng,
    placeName,
    formattedAddress,
    googlePlaceId,
    googleMapsUrl: buildGoogleMapsUrl(lat, lng, googlePlaceId || undefined),
    locationSource,
    locationConfidence,
    geofenceRadiusM:
      locationConfidence === 'exact'
        ? SCHOOL_GEOFENCE_EXACT_M
        : SCHOOL_GEOFENCE_VILLAGE_M,
    queryUsed,
  };
}

/** Step 1: try the full school name on Google Places (exact school pin → 100 m geofence). */
async function searchSchoolPlace(
  schoolName: string,
  block: string,
  district: string,
  udise: string,
  apiKey: string,
): Promise<{
  exact: ResolvedSchoolPlace | null;
  weak: ResolvedSchoolPlace | null;
}> {
  let weak: ResolvedSchoolPlace | null = null;

  for (const query of buildSchoolQueries(schoolName, block, district, udise)) {
    const placesMatch = await searchGooglePlaces(query, apiKey);
    if (!placesMatch) continue;

    if (looksLikeSchool(placesMatch.types)) {
      return {
        exact: toResolvedPlace(
          placesMatch.lat,
          placesMatch.lng,
          placesMatch.placeName || schoolName,
          placesMatch.formattedAddress,
          placesMatch.placeId,
          'google_places',
          'exact',
          query,
        ),
        weak: null,
      };
    }

    if (!weak) {
      weak = toResolvedPlace(
        placesMatch.lat,
        placesMatch.lng,
        placesMatch.placeName || schoolName,
        placesMatch.formattedAddress,
        placesMatch.placeId,
        'google_places',
        'partial',
        query,
      );
    }
  }

  return { exact: null, weak };
}

function buildVillageQueries(
  village: string,
  block: string,
  district: string,
): string[] {
  const queries = [
    [village, block, district, 'Bihar', 'India'],
    [village, district, 'Bihar', 'India'],
    [village, block, 'Bihar', 'India'],
  ]
    .map((parts) => parts.filter(Boolean).join(', '))
    .filter(Boolean);
  return [...new Set(queries)];
}

/** Step 2: try the village name extracted from the school title (village pin → 400 m geofence). */
async function resolveVillagePlace(
  village: string,
  block: string,
  district: string,
  apiKey: string,
): Promise<ResolvedSchoolPlace | null> {
  for (const villageQuery of buildVillageQueries(village, block, district)) {
    const villagePlaces = await searchGooglePlaces(villageQuery, apiKey);
    if (villagePlaces) {
      return toResolvedPlace(
        villagePlaces.lat,
        villagePlaces.lng,
        villagePlaces.placeName || village,
        villagePlaces.formattedAddress,
        villagePlaces.placeId,
        'google_places',
        'village',
        villageQuery,
      );
    }

    const geocoded = await geocodeAddress(villageQuery, apiKey);
    if (geocoded) {
      return toResolvedPlace(
        geocoded.lat,
        geocoded.lng,
        village,
        geocoded.formattedAddress,
        '',
        'village_fallback',
        'village',
        villageQuery,
      );
    }
  }
  return null;
}

export async function resolveSchoolPlace(
  school: {
    schoolName?: string;
    block?: string;
    district?: string;
    udise?: string;
  },
  apiKey?: string,
): Promise<ResolvedSchoolPlace | null> {
  const key = String(
    apiKey ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      '',
  ).trim();
  if (!key) return null;

  const schoolName = String(school.schoolName || '').trim();
  const block = String(school.block || '').trim();
  const district = String(school.district || '').trim();
  const udise = String(school.udise || '').trim();
  if (!schoolName) return null;

  // 1) School name first — exact Google school listing (100 m).
  const schoolSearch = await searchSchoolPlace(
    schoolName,
    block,
    district,
    udise,
    key,
  );
  if (schoolSearch.exact) return schoolSearch.exact;

  // 2) Village name from school title — e.g. BISHNUPUR from "GUNANAND M S BISHNUPUR" (400 m).
  const village = localityHintFromSchoolName(schoolName);
  if (village && village.toLowerCase() !== block.toLowerCase()) {
    const villageMatch = await resolveVillagePlace(village, block, district, key);
    if (villageMatch) return villageMatch;
  }

  // 3) Weak school Places hit or geocoded school name (400 m).
  if (schoolSearch.weak) return schoolSearch.weak;

  for (const query of buildSchoolQueries(schoolName, block, district, udise)) {
    const geocodedSchool = await geocodeAddress(query, key);
    if (geocodedSchool) {
      return toResolvedPlace(
        geocodedSchool.lat,
        geocodedSchool.lng,
        schoolName,
        geocodedSchool.formattedAddress,
        '',
        'google_geocode',
        'partial',
        query,
      );
    }
  }

  return null;
}

export function geofenceAreaLabel(confidence: string): string {
  if (confidence === 'exact') return 'school';
  if (confidence === 'village') return 'village';
  return 'school or village area';
}

export function defaultGeofenceRadiusM(confidence: string, explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  if (confidence === 'exact') return SCHOOL_GEOFENCE_EXACT_M;
  if (confidence === 'village' || confidence === 'partial') return SCHOOL_GEOFENCE_VILLAGE_M;
  return SCHOOL_GEOFENCE_EXACT_M;
}

export function buildDualPinMapsUrl(
  schoolLat: number,
  schoolLng: number,
  visitLat: number,
  visitLng: number,
): string {
  return `https://www.google.com/maps/dir/${schoolLat},${schoolLng}/${visitLat},${visitLng}`;
}

export function buildDualPinOsmUrl(
  schoolLat: number,
  schoolLng: number,
  visitLat: number,
  visitLng: number,
): string {
  const midLat = (schoolLat + visitLat) / 2;
  const midLng = (schoolLng + visitLng) / 2;
  return `https://www.openstreetmap.org/?mlat=${midLat}&mlon=${midLng}#map=16/${midLat}/${midLng}`;
}
