import { coordinatesInBihar } from './bihar-geography.util';
import { localityHintFromSchoolName } from './reverse-geocode.util';
import { placeInExpectedDistrict } from './village-location.util';

export type SchoolPlaceConfidence = 'exact' | 'partial' | 'village' | 'not_found';

export type ResolvedSchoolPlace = {
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  googlePlaceId: string;
  googleMapsUrl: string;
  locationSource: 'google_places' | 'google_geocode' | 'village_fallback' | 'osm_nominatim';
  locationConfidence: SchoolPlaceConfidence;
  geofenceRadiusM: number;
  queryUsed: string;
  matchScore?: number;
  resolutionStep?: 'school' | 'village' | 'osm_village';
};

export const SCHOOL_GEOFENCE_EXACT_M = 100;
export const SCHOOL_GEOFENCE_VILLAGE_M = 400;
export const VISIT_MAX_GPS_ACCURACY_M = 50;

export function isGooglePlacesConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function getGoogleMapsApiKey(): string {
  return String(
    process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || '',
  ).trim();
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
  const village = localityHintFromSchoolName(schoolName);
  const base = normalizeSchoolQuery(schoolName, block, district);
  const withUdise = udise
    ? normalizeSchoolQuery(schoolName, block, district, udise)
    : '';
  const villageSchool = village
    ? [village, 'school', block, district, 'Bihar', 'India'].filter(Boolean).join(', ')
    : '';
  const schoolInVillage = village
    ? [schoolName, village, block, 'Bihar', 'India'].filter(Boolean).join(', ')
    : '';
  return [...new Set([base, withUdise, villageSchool, schoolInVillage].filter(Boolean))];
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

/** Handles Basatpur vs Bassatpur-style spelling drift in Google/OSM results. */
function tokenInHaystack(token: string, haystack: string): boolean {
  if (!token || !haystack) return false;
  if (haystack.includes(token)) return true;
  if (token.length < 5) return false;
  return haystack
    .split(' ')
    .some((word) => word.length >= 4 && editDistance(token, word) <= 1);
}

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_SCHOOL_WORDS = new Set([
  'kanya',
  'govt',
  'government',
  'school',
  'vidyalaya',
  'vidyalay',
  'middle',
  'primary',
  'high',
  'upgrade',
  'upgraded',
  'basic',
  'adarsh',
  'janta',
  'nps',
  'ups',
  'ums',
  'ms',
  'ps',
  'hs',
  'u',
  'm',
  's',
  'p',
  'h',
]);

function extractSignificantTokens(schoolName: string, block: string, district: string): string[] {
  const village = localityHintFromSchoolName(schoolName);
  const tokens = new Set<string>();

  if (village) {
    const villageNorm = normalizeToken(village);
    if (villageNorm.length >= 3) tokens.add(villageNorm);
    villageNorm.split(' ').forEach((part) => {
      if (part.length >= 3) tokens.add(part);
    });
  }

  for (const word of normalizeToken(schoolName).split(' ')) {
    if (word.length < 4) continue;
    if (GENERIC_SCHOOL_WORDS.has(word)) continue;
    if (normalizeToken(block) === word) continue;
    if (normalizeToken(district) === word) continue;
    tokens.add(word);
  }

  return [...tokens].sort((a, b) => b.length - a.length);
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

function isAdminPlaceText(text: string, block?: string): boolean {
  return isAdminPlaceName(text, block);
}

/** Block office / wrong-village pins must not be used for visit geofencing. */
export function isUnsafeSchoolPin(school: {
  schoolName?: string;
  matchedPlaceName?: string;
  formattedAddress?: string;
  block?: string;
  district?: string;
  locationConfidence?: string;
  siblingBlocks?: string[];
  lat?: number | string;
  lng?: number | string;
}): boolean {
  const lat = Number(school.lat);
  const lng = Number(school.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !coordinatesInBihar(lat, lng)) {
    return true;
  }

  const matchedPlaceName = String(school.matchedPlaceName || '').trim();
  const formattedAddress = String(school.formattedAddress || '').trim();
  const schoolName = String(school.schoolName || '').trim();
  const block = String(school.block || '').trim();
  const district = String(school.district || '').trim();
  const confidence = String(school.locationConfidence || '').trim();
  const siblingBlocks = school.siblingBlocks ?? [];

  if (isAdminPlaceName(matchedPlaceName, block)) {
    return true;
  }
  if (isAdminPlaceName(formattedAddress, block)) {
    return true;
  }

  if (formattedAddress && district) {
    if (confidence === 'village') {
      if (!placeInExpectedDistrict(formattedAddress, district)) {
        return true;
      }
    } else if (block && !placeInExpectedAdminArea(formattedAddress, block, district, siblingBlocks)) {
      return true;
    }
  }

  if (!matchedPlaceName || !schoolName) return false;

  if (confidence === 'village') {
    const village = localityHintFromSchoolName(schoolName);
    const villageNorm = normalizeToken(village);
    const matchedNorm = normalizeToken(matchedPlaceName);
    if (villageNorm && matchedNorm.includes(villageNorm)) return false;
  }

  return !placeMatchesSchoolContext(
    schoolName,
    matchedPlaceName,
    '',
    block,
    district,
  );
}

function placeText(placeName: string, formattedAddress: string): string {
  return normalizeToken(`${placeName} ${formattedAddress}`);
}

function wrongBlockMentionedInAddress(
  haystack: string,
  expectedBlock: string,
  siblingBlocks: string[],
): string | null {
  const expectedNorm = normalizeToken(expectedBlock);
  for (const sibling of siblingBlocks) {
    const siblingNorm = normalizeToken(sibling);
    if (!siblingNorm || siblingNorm.length < 4) continue;
    if (siblingNorm === expectedNorm) continue;
    if (tokenInHaystack(siblingNorm, haystack)) {
      return sibling;
    }
  }
  return null;
}

/** Google/OSM address must name this block & district — rejects Kumarkhand hits for Alamnagar schools. */
export function placeInExpectedAdminArea(
  formattedAddress: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): boolean {
  const haystack = placeText('', formattedAddress);
  if (!haystack) return false;

  const districtNorm = normalizeToken(district);
  if (districtNorm && districtNorm.length >= 3) {
    if (!tokenInHaystack(districtNorm, haystack)) return false;
  }

  const blockNorm = normalizeToken(block);
  if (blockNorm && blockNorm.length >= 3) {
    if (!tokenInHaystack(blockNorm, haystack)) return false;
  }

  if (wrongBlockMentionedInAddress(haystack, block, siblingBlocks)) return false;

  return true;
}

export function adminAreaMismatchReason(
  formattedAddress: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): string | null {
  const haystack = placeText('', formattedAddress);
  if (!haystack) return 'No address on Google match';

  const districtNorm = normalizeToken(district);
  if (districtNorm && districtNorm.length >= 3 && !tokenInHaystack(districtNorm, haystack)) {
    return `District "${district}" not in Google address — likely wrong area`;
  }

  const blockNorm = normalizeToken(block);
  if (blockNorm && blockNorm.length >= 3 && !tokenInHaystack(blockNorm, haystack)) {
    return `Block "${block}" not in Google address — likely outside this block`;
  }

  const wrongBlock = wrongBlockMentionedInAddress(haystack, block, siblingBlocks);
  if (wrongBlock) {
    return `Address mentions block "${wrongBlock}", not "${block}"`;
  }

  return null;
}

function isBlockedPlaceCandidate(
  placeName: string,
  formattedAddress: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): boolean {
  if (isAdminPlaceName(placeName, block)) return true;
  if (isAdminPlaceText(formattedAddress, block)) return true;
  if (!placeInExpectedAdminArea(formattedAddress, block, district, siblingBlocks)) return true;
  return false;
}

/** Google result must mention the school village/name — blocks Padampur for Basatpur, Block Office, etc. */
export function placeMatchesSchoolContext(
  schoolName: string,
  placeName: string,
  formattedAddress: string,
  block: string,
  district: string,
): boolean {
  if (isAdminPlaceName(placeName, block)) return false;

  const haystack = placeText(placeName, formattedAddress);
  if (!haystack) return false;

  const tokens = extractSignificantTokens(schoolName, block, district);
  if (!tokens.length) return false;

  return tokens.some((token) => token.length >= 4 && tokenInHaystack(token, haystack));
}

function scoreSchoolCandidate(
  candidate: {
    placeName: string;
    formattedAddress: string;
    types: string[];
  },
  schoolName: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): number {
  if (
    isBlockedPlaceCandidate(
      candidate.placeName,
      candidate.formattedAddress,
      block,
      district,
      siblingBlocks,
    )
  ) {
    return -1;
  }

  const haystack = placeText(candidate.placeName, candidate.formattedAddress);
  const tokens = extractSignificantTokens(schoolName, block, district);
  if (!tokens.some((token) => token.length >= 4 && tokenInHaystack(token, haystack))) {
    return -1;
  }

  let score = 0;
  if (isExactSchoolType(candidate.types)) score += 50;

  for (const token of tokens) {
    if (token.length >= 4 && tokenInHaystack(token, haystack)) score += 15;
  }

  const village = normalizeToken(localityHintFromSchoolName(schoolName));
  if (village && tokenInHaystack(village, haystack)) score += 25;

  const schoolNorm = normalizeToken(schoolName);
  const placeNorm = normalizeToken(candidate.placeName);
  if (schoolNorm && placeNorm && (placeNorm.includes(schoolNorm) || schoolNorm.includes(placeNorm))) {
    score += 10;
  }

  return score;
}

function scoreVillageCandidate(
  candidate: { placeName: string; formattedAddress: string },
  village: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): number {
  if (
    isBlockedPlaceCandidate(
      candidate.placeName,
      candidate.formattedAddress,
      block,
      district,
      siblingBlocks,
    )
  ) {
    return -1;
  }

  const villageNorm = normalizeToken(village);
  if (!villageNorm) return -1;

  const haystack = placeText(candidate.placeName, candidate.formattedAddress);
  if (!tokenInHaystack(villageNorm, haystack)) return -1;

  let score = 40;
  if (normalizeToken(candidate.placeName) === villageNorm) score += 20;
  if (haystack.includes(`${villageNorm} village`)) score += 15;
  if (haystack.includes('bihar')) score += 5;
  return score;
}

function isExactSchoolType(types: string[] | undefined): boolean {
  if (!types?.length) return false;
  const exactSchoolTypes = new Set(['school', 'primary_school', 'secondary_school']);
  return types.some((t) => exactSchoolTypes.has(t));
}

async function* searchGooglePlacesCandidates(
  textQuery: string,
  apiKey: string,
): AsyncGenerator<{
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  placeId: string;
  types: string[];
}> {
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
    if (!res.ok) return;
    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        types?: string[];
      }>;
    };
    for (const place of data.places ?? []) {
      if (!place?.location) continue;
      const lat = Number(place.location.latitude);
      const lng = Number(place.location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      yield {
        lat,
        lng,
        placeName: String(place.displayName?.text || '').trim(),
        formattedAddress: String(place.formattedAddress || '').trim(),
        placeId: String(place.id || '').trim(),
        types: Array.isArray(place.types) ? place.types : [],
      };
    }
  } catch {
    /* ignore */
  }
}

function pickBestSchoolPlace(
  candidates: Array<{
    lat: number;
    lng: number;
    placeName: string;
    formattedAddress: string;
    placeId: string;
    types: string[];
  }>,
  schoolName: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): { match: (typeof candidates)[number]; score: number } | null {
  let best: { match: (typeof candidates)[number]; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreSchoolCandidate(
      candidate,
      schoolName,
      block,
      district,
      siblingBlocks,
    );
    if (score < 50) continue;
    if (!isExactSchoolType(candidate.types)) continue;
    if (!best || score > best.score) {
      best = { match: candidate, score };
    }
  }

  return best;
}

function pickVillagePlace(
  candidates: Array<{
    lat: number;
    lng: number;
    placeName: string;
    formattedAddress: string;
    placeId: string;
    types: string[];
  }>,
  village: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): { match: (typeof candidates)[number]; score: number } | null {
  let best: { match: (typeof candidates)[number]; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreVillageCandidate(
      candidate,
      village,
      block,
      district,
      siblingBlocks,
    );
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { match: candidate, score };
    }
  }

  return best;
}

async function collectGooglePlacesCandidates(
  textQuery: string,
  apiKey: string,
  limit = 5,
): Promise<
  Array<{
    lat: number;
    lng: number;
    placeName: string;
    formattedAddress: string;
    placeId: string;
    types: string[];
  }>
> {
  const results: Array<{
    lat: number;
    lng: number;
    placeName: string;
    formattedAddress: string;
    placeId: string;
    types: string[];
  }> = [];

  for await (const place of searchGooglePlacesCandidates(textQuery, apiKey)) {
    results.push(place);
    if (results.length >= limit) break;
  }

  return results;
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
    url.searchParams.set('region', 'in');
    url.searchParams.set('components', 'administrative_area:Bihar|country:IN');
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
  extras?: {
    matchScore?: number;
    resolutionStep?: ResolvedSchoolPlace['resolutionStep'];
  },
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
    matchScore: extras?.matchScore,
    resolutionStep: extras?.resolutionStep,
  };
}

/** Step 1: exact Google school listing only (100 m geofence). No block office or vague matches. */
async function searchSchoolPlace(
  schoolName: string,
  block: string,
  district: string,
  udise: string,
  apiKey: string,
  siblingBlocks: string[] = [],
): Promise<ResolvedSchoolPlace | null> {
  for (const query of buildSchoolQueries(schoolName, block, district, udise)) {
    const candidates = await collectGooglePlacesCandidates(query, apiKey);
    if (!candidates.length) continue;

    const picked = pickBestSchoolPlace(
      candidates,
      schoolName,
      block,
      district,
      siblingBlocks,
    );
    if (!picked) continue;

    return toResolvedPlace(
      picked.match.lat,
      picked.match.lng,
      picked.match.placeName || schoolName,
      picked.match.formattedAddress,
      picked.match.placeId,
      'google_places',
      'exact',
      query,
      { matchScore: picked.score, resolutionStep: 'school' },
    );
  }

  return null;
}

function buildVillageQueries(
  village: string,
  block: string,
  district: string,
): string[] {
  const queries = [
    [village, 'village', block, district, 'Bihar', 'India'],
    [village, block, district, 'Bihar', 'India'],
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
        'User-Agent': 'FlexHRM-SchoolResolver/1.0 (school location lookup)',
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

/** Step 3 (free): OpenStreetMap village lookup when Google misses rural Bihar hamlets. */
async function resolveVillageOsm(
  village: string,
  block: string,
  district: string,
  siblingBlocks: string[] = [],
): Promise<ResolvedSchoolPlace | null> {
  for (const villageQuery of buildVillageQueries(village, block, district)) {
    const results = await searchNominatimForward(villageQuery);
    let best: { lat: number; lng: number; displayName: string; score: number } | null = null;

    for (const result of results) {
      const score = scoreVillageCandidate(
        { placeName: result.displayName, formattedAddress: result.displayName },
        village,
        block,
        district,
        siblingBlocks,
      );
      if (score < 0) continue;
      if (!best || score > best.score) {
        best = { ...result, score };
      }
    }

    if (best) {
      return toResolvedPlace(
        best.lat,
        best.lng,
        village,
        best.displayName,
        '',
        'osm_nominatim',
        'village',
        villageQuery,
        { matchScore: best.score, resolutionStep: 'osm_village' },
      );
    }

    await new Promise((r) => setTimeout(r, 1100));
  }
  return null;
}

/** Step 2: try the village name extracted from the school title (village pin → 400 m geofence). */
async function resolveVillagePlace(
  village: string,
  block: string,
  district: string,
  apiKey: string,
  siblingBlocks: string[] = [],
): Promise<ResolvedSchoolPlace | null> {
  for (const villageQuery of buildVillageQueries(village, block, district)) {
    const candidates = await collectGooglePlacesCandidates(villageQuery, apiKey);
    const picked = pickVillagePlace(
      candidates,
      village,
      block,
      district,
      siblingBlocks,
    );
    if (picked) {
      return toResolvedPlace(
        picked.match.lat,
        picked.match.lng,
        picked.match.placeName || village,
        picked.match.formattedAddress,
        picked.match.placeId,
        'google_places',
        'village',
        villageQuery,
        { matchScore: picked.score, resolutionStep: 'village' },
      );
    }

    const geocoded = await geocodeAddress(villageQuery, apiKey);
    if (geocoded) {
      if (
        isBlockedPlaceCandidate(
          village,
          geocoded.formattedAddress,
          block,
          district,
          siblingBlocks,
        )
      ) {
        continue;
      }
      const score = scoreVillageCandidate(
        { placeName: village, formattedAddress: geocoded.formattedAddress },
        village,
        block,
        district,
        siblingBlocks,
      );
      if (score >= 0) {
        return toResolvedPlace(
          geocoded.lat,
          geocoded.lng,
          village,
          geocoded.formattedAddress,
          '',
          'village_fallback',
          'village',
          villageQuery,
          { matchScore: score, resolutionStep: 'village' },
        );
      }
    }
  }
  return null;
}

/** Optional hybrid upgrade: exact Google school (100 m) when listed. */
export async function tryExactSchoolUpgrade(
  school: {
    schoolName?: string;
    block?: string;
    district?: string;
    udise?: string;
  },
  apiKey?: string,
  siblingBlocks: string[] = [],
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

  return searchSchoolPlace(schoolName, block, district, udise, key, siblingBlocks);
}

export async function resolveSchoolPlace(
  school: {
    schoolName?: string;
    block?: string;
    district?: string;
    udise?: string;
  },
  apiKey?: string,
  siblingBlocks: string[] = [],
): Promise<ResolvedSchoolPlace | null> {
  const key = String(
    apiKey ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      '',
  ).trim();

  const schoolName = String(school.schoolName || '').trim();
  const block = String(school.block || '').trim();
  const district = String(school.district || '').trim();
  const udise = String(school.udise || '').trim();
  if (!schoolName) return null;

  // 1) Exact school on Google (100 m) — supervisor at the school building.
  if (key) {
    const schoolMatch = await searchSchoolPlace(
      schoolName,
      block,
      district,
      udise,
      key,
      siblingBlocks,
    );
    if (schoolMatch) return schoolMatch;
  }

  // 2–3) Village from school title (400 m) — Google strict, then OSM + relaxed district match.
  const village = localityHintFromSchoolName(schoolName);
  if (village && village.toLowerCase() !== block.toLowerCase()) {
    if (key) {
      const villageMatch = await resolveVillagePlace(
        village,
        block,
        district,
        key,
        siblingBlocks,
      );
      if (villageMatch) return villageMatch;
    }

    const { resolveVillagePin, villagePinToSchoolPlace } = await import(
      './village-location.util'
    );
    const { pin } = await resolveVillagePin(village, block, district, key);
    if (pin) return villagePinToSchoolPlace(pin);
  }

  return null;
}

/** Google-only location search for admin map (Places + Geocode, Bihar). */
export async function searchGoogleMapLocations(
  query: string,
  apiKey?: string,
): Promise<Array<{ lat: number; lng: number; displayName: string; source: string }>> {
  const key = String(apiKey || getGoogleMapsApiKey()).trim();
  if (!key) return [];

  const q = String(query || '').trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: Array<{ lat: number; lng: number; displayName: string; source: string }> = [];

  const push = (
    lat: number,
    lng: number,
    displayName: string,
    source: string,
  ) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!coordinatesInBihar(lat, lng)) return;
    const dedupeKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    results.push({
      lat,
      lng,
      displayName: displayName.trim() || `${lat}, ${lng}`,
      source,
    });
  };

  const textQuery = q.toLowerCase().includes('bihar')
    ? q
    : `${q}, Bihar, India`;

  for await (const place of searchGooglePlacesCandidates(textQuery, key)) {
    push(
      place.lat,
      place.lng,
      place.formattedAddress || place.placeName,
      'google_places',
    );
    if (results.length >= 8) break;
  }

  if (results.length < 8) {
    const geocoded = await geocodeAddress(textQuery, key);
    if (geocoded) {
      push(
        geocoded.lat,
        geocoded.lng,
        geocoded.formattedAddress,
        'google_geocode',
      );
    }
  }

  return results.slice(0, 8);
}

/** Many schools at one pin usually means block office — flag for admin review. */
export function duplicatePinWarnings(
  rows: Array<{ schoolWorkId?: string; lat?: number; lng?: number }>,
  minCount = 3,
): Map<string, string> {
  const buckets = new Map<string, string[]>();

  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const id = String(row.schoolWorkId || '').trim();
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const ids = buckets.get(key) ?? [];
    ids.push(id);
    buckets.set(key, ids);
  }

  const warnings = new Map<string, string>();
  for (const ids of buckets.values()) {
    if (ids.length < minCount) continue;
    const message = `${ids.length} schools share this pin — likely block office or bad batch match`;
    for (const id of ids) warnings.set(id, message);
  }
  return warnings;
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
