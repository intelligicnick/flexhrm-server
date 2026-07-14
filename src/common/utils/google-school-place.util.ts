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

async function resolveVillagePlace(
  village: string,
  block: string,
  district: string,
  apiKey: string,
): Promise<ResolvedSchoolPlace | null> {
  for (const villageQuery of buildVillageQueries(village, block, district)) {
    const villagePlaces = await searchGooglePlaces(villageQuery, apiKey);
    if (villagePlaces) {
      return {
        lat: villagePlaces.lat,
        lng: villagePlaces.lng,
        placeName: villagePlaces.placeName || village,
        formattedAddress: villagePlaces.formattedAddress,
        googlePlaceId: villagePlaces.placeId,
        googleMapsUrl: buildGoogleMapsUrl(
          villagePlaces.lat,
          villagePlaces.lng,
          villagePlaces.placeId,
        ),
        locationSource: 'google_places',
        locationConfidence: 'village',
        geofenceRadiusM: SCHOOL_GEOFENCE_VILLAGE_M,
        queryUsed: villageQuery,
      };
    }

    const geocoded = await geocodeAddress(villageQuery, apiKey);
    if (geocoded) {
      return {
        lat: geocoded.lat,
        lng: geocoded.lng,
        placeName: village,
        formattedAddress: geocoded.formattedAddress,
        googlePlaceId: '',
        googleMapsUrl: buildGoogleMapsUrl(geocoded.lat, geocoded.lng),
        locationSource: 'village_fallback',
        locationConfidence: 'village',
        geofenceRadiusM: SCHOOL_GEOFENCE_VILLAGE_M,
        queryUsed: villageQuery,
      };
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

  const primaryQuery = normalizeSchoolQuery(schoolName, block, district, udise);
  const placesMatch = await searchGooglePlaces(primaryQuery, key);
  if (placesMatch) {
    const confidence: SchoolPlaceConfidence = looksLikeSchool(placesMatch.types)
      ? 'exact'
      : 'partial';
    return {
      lat: placesMatch.lat,
      lng: placesMatch.lng,
      placeName: placesMatch.placeName || schoolName,
      formattedAddress: placesMatch.formattedAddress,
      googlePlaceId: placesMatch.placeId,
      googleMapsUrl: buildGoogleMapsUrl(
        placesMatch.lat,
        placesMatch.lng,
        placesMatch.placeId,
      ),
      locationSource: 'google_places',
      locationConfidence: confidence,
      geofenceRadiusM:
        confidence === 'exact' ? SCHOOL_GEOFENCE_EXACT_M : SCHOOL_GEOFENCE_VILLAGE_M,
      queryUsed: primaryQuery,
    };
  }

  const village = localityHintFromSchoolName(schoolName);
  if (village && village.toLowerCase() !== block.toLowerCase()) {
    const villageMatch = await resolveVillagePlace(village, block, district, key);
    if (villageMatch) return villageMatch;
  }

  const geocodedSchool = await geocodeAddress(primaryQuery, key);
  if (geocodedSchool) {
    return {
      lat: geocodedSchool.lat,
      lng: geocodedSchool.lng,
      placeName: schoolName,
      formattedAddress: geocodedSchool.formattedAddress,
      googlePlaceId: '',
      googleMapsUrl: buildGoogleMapsUrl(geocodedSchool.lat, geocodedSchool.lng),
      locationSource: 'google_geocode',
      locationConfidence: 'partial',
      geofenceRadiusM: SCHOOL_GEOFENCE_VILLAGE_M,
      queryUsed: primaryQuery,
    };
  }

  return null;
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
