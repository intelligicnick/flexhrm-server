import { localityHintFromSchoolName } from './reverse-geocode.util';

export const SCHOOL_GEOFENCE_VILLAGE_M = 400;

export type ResolvedVillagePin = {
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  googleMapsUrl: string;
  locationSource: 'osm_nominatim' | 'google_geocode' | 'google_places';
  locationConfidence: 'village';
  geofenceRadiusM: number;
  queryUsed: string;
  matchScore: number;
  resolutionStep: 'osm_village' | 'village';
};

export type VillagePinFailureReason =
  | 'empty_village_hint'
  | 'admin_place'
  | 'district_mismatch'
  | 'village_not_in_result'
  | 'osm_and_google_miss';

function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function tokenInHaystack(token: string, haystack: string): boolean {
  if (!token || !haystack) return false;
  if (haystack.includes(token)) return true;
  if (token.length < 5) return false;
  return haystack
    .split(' ')
    .some((word) => word.length >= 4 && editDistance(token, word) <= 1);
}

function isAdminPlaceName(placeName: string, block?: string): boolean {
  const norm = normalizeToken(placeName);
  if (!norm) return true;
  const adminPatterns = [
    /\bblock office\b/,
    /\bbdo\b/,
    /\bpanchayat\b/,
    /\bcircle office\b/,
    /\btahsil\b/,
    /\btehsil\b/,
    /\bsub division\b/,
    /\bdistrict office\b/,
    /\bcourt\b/,
    /\bpolice station\b/,
    /\bpost office\b/,
  ];
  if (adminPatterns.some((pattern) => pattern.test(norm))) return true;
  if (block) {
    const blockNorm = normalizeToken(block);
    if (blockNorm && norm.includes(`${blockNorm} block office`)) return true;
    if (blockNorm && norm === `${blockNorm} block`) return true;
  }
  return false;
}

/** Relaxed: district or Bihar in address — block name not required for village pins. */
export function placeInExpectedDistrict(
  formattedAddress: string,
  district: string,
): boolean {
  const haystack = normalizeToken(formattedAddress);
  if (!haystack) return false;
  if (haystack.includes('bihar')) return true;
  const districtNorm = normalizeToken(district);
  if (districtNorm && districtNorm.length >= 3) {
    return tokenInHaystack(districtNorm, haystack);
  }
  return true;
}

function scoreRelaxedVillageCandidate(
  placeName: string,
  formattedAddress: string,
  village: string,
  block: string,
  district: string,
): number {
  if (isAdminPlaceName(placeName, block)) return -1;
  if (isAdminPlaceName(formattedAddress, block)) return -1;
  if (!placeInExpectedDistrict(formattedAddress, district)) return -1;

  const villageNorm = normalizeToken(village);
  if (!villageNorm) return -1;

  const haystack = normalizeToken(`${placeName} ${formattedAddress}`);
  if (!tokenInHaystack(villageNorm, haystack)) return -1;

  let score = 50;
  if (normalizeToken(placeName) === villageNorm) score += 20;
  if (haystack.includes(`${villageNorm} village`)) score += 15;
  if (haystack.includes('bihar')) score += 5;
  return score;
}

function buildVillageQueries(village: string, block: string, district: string): string[] {
  const queries = [
    [village, 'village', block, district, 'Bihar', 'India'],
    [village, district, 'Bihar', 'India'],
    [village, block, 'Bihar', 'India'],
  ]
    .map((parts) => parts.filter(Boolean).join(', '))
    .filter(Boolean);
  return [...new Set(queries)];
}

async function searchNominatimForward(
  query: string,
): Promise<Array<{ lat: number; lng: number; displayName: string }>> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'in');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FlexHRM-VillageResolver/1.0 (school village lookup)',
      },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    return data
      .map((row) => ({
        lat: Number(row.lat),
        lng: Number(row.lon),
        displayName: String(row.display_name || '').trim(),
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
  } catch {
    return [];
  }
}

async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
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

function toVillagePin(
  lat: number,
  lng: number,
  placeName: string,
  formattedAddress: string,
  locationSource: ResolvedVillagePin['locationSource'],
  queryUsed: string,
  matchScore: number,
  resolutionStep: ResolvedVillagePin['resolutionStep'],
): ResolvedVillagePin {
  return {
    lat,
    lng,
    placeName,
    formattedAddress,
    googleMapsUrl: buildGoogleMapsUrl(lat, lng),
    locationSource,
    locationConfidence: 'village',
    geofenceRadiusM: SCHOOL_GEOFENCE_VILLAGE_M,
    queryUsed,
    matchScore,
    resolutionStep,
  };
}

/** Primary village-first resolver: OSM → Google geocode. District-only validation. */
export async function resolveVillagePin(
  village: string,
  block: string,
  district: string,
  apiKey?: string,
): Promise<{ pin: ResolvedVillagePin | null; failureReason: VillagePinFailureReason | null }> {
  const villageNorm = String(village || '').trim();
  if (!villageNorm || villageNorm.length < 3) {
    return { pin: null, failureReason: 'empty_village_hint' };
  }

  const key = String(
    apiKey ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      '',
  ).trim();

  for (const query of buildVillageQueries(villageNorm, block, district)) {
    const osmResults = await searchNominatimForward(query);
    let bestOsm: { lat: number; lng: number; displayName: string; score: number } | null = null;

    for (const result of osmResults) {
      const score = scoreRelaxedVillageCandidate(
        result.displayName,
        result.displayName,
        villageNorm,
        block,
        district,
      );
      if (score < 0) continue;
      if (!bestOsm || score > bestOsm.score) {
        bestOsm = { ...result, score };
      }
    }

    if (bestOsm) {
      return {
        pin: toVillagePin(
          bestOsm.lat,
          bestOsm.lng,
          villageNorm,
          bestOsm.displayName,
          'osm_nominatim',
          query,
          bestOsm.score,
          'osm_village',
        ),
        failureReason: null,
      };
    }

    if (key) {
      const geocoded = await geocodeAddress(query, key);
      if (geocoded) {
        const score = scoreRelaxedVillageCandidate(
          villageNorm,
          geocoded.formattedAddress,
          villageNorm,
          block,
          district,
        );
        if (score >= 0) {
          return {
            pin: toVillagePin(
              geocoded.lat,
              geocoded.lng,
              villageNorm,
              geocoded.formattedAddress,
              'google_geocode',
              query,
              score,
              'village',
            ),
            failureReason: null,
          };
        }
      }
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  return { pin: null, failureReason: 'osm_and_google_miss' };
}

export function villagePinToSchoolPlace(pin: ResolvedVillagePin): {
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  googlePlaceId: string;
  googleMapsUrl: string;
  locationSource: ResolvedVillagePin['locationSource'];
  locationConfidence: 'village';
  geofenceRadiusM: number;
  queryUsed: string;
  matchScore?: number;
  resolutionStep?: 'osm_village' | 'village';
} {
  return {
    lat: pin.lat,
    lng: pin.lng,
    placeName: pin.placeName,
    formattedAddress: pin.formattedAddress,
    googlePlaceId: '',
    googleMapsUrl: pin.googleMapsUrl,
    locationSource: pin.locationSource,
    locationConfidence: 'village',
    geofenceRadiusM: pin.geofenceRadiusM,
    queryUsed: pin.queryUsed,
    matchScore: pin.matchScore,
    resolutionStep: pin.resolutionStep,
  };
}

export { localityHintFromSchoolName };
