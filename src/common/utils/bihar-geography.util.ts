/** Bihar bounding box — rejects pins in Rajasthan, Jharkhand (west), etc. */
export const BIHAR_BOUNDS = {
  minLat: 24.15,
  maxLat: 27.85,
  minLng: 83.25,
  maxLng: 88.15,
} as const;

const WRONG_STATE_PATTERNS = [
  /\brajasthan\b/,
  /\bgujarat\b/,
  /\bmaharashtra\b/,
  /\buttar pradesh\b/,
  /\buttarakhand\b/,
  /\bwest bengal\b/,
  /\bodisha\b/,
  /\bandhra pradesh\b/,
  /\btelangana\b/,
  /\bkarnataka\b/,
  /\btamil nadu\b/,
  /\bkerala\b/,
  /\bpunjab\b/,
  /\bharyana\b/,
  /\bhimachal pradesh\b/,
  /\bjammu\b/,
  /\bkashmir\b/,
  /\bassam\b/,
  /\bsikkim\b/,
  /\barunachal pradesh\b/,
  /\bnagaland\b/,
  /\bmanipur\b/,
  /\bmizoram\b/,
  /\btripura\b/,
  /\bmeghalaya\b/,
  /\bgoa\b/,
  /\bchhattisgarh\b/,
  /\bmadhya pradesh\b/,
  /\bdelhi\b/,
  /\bchandigarh\b/,
];

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

export function tokenInHaystack(token: string, haystack: string): boolean {
  if (!token || !haystack) return false;
  if (haystack.includes(token)) return true;
  if (token.length < 5) return false;
  return haystack
    .split(' ')
    .some((word) => word.length >= 4 && editDistance(token, word) <= 1);
}

export function coordinatesInBihar(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= BIHAR_BOUNDS.minLat &&
    lat <= BIHAR_BOUNDS.maxLat &&
    lng >= BIHAR_BOUNDS.minLng &&
    lng <= BIHAR_BOUNDS.maxLng
  );
}

/** Approximate district bounding boxes — rejects registry/Google pins in the wrong part of Bihar. */
const DISTRICT_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  purnia: { minLat: 25.45, maxLat: 26.55, minLng: 86.75, maxLng: 87.95 },
  madhepura: { minLat: 25.55, maxLat: 26.45, minLng: 86.35, maxLng: 87.35 },
};

export function coordinatesInExpectedDistrict(
  lat: number,
  lng: number,
  district: string,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const districtNorm = normalizeToken(district);
  const bounds = DISTRICT_BOUNDS[districtNorm];
  if (!bounds) return true;
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

export function districtCoordinateMismatchReason(
  lat: number,
  lng: number,
  district: string,
): string | null {
  if (!district.trim()) return null;
  if (coordinatesInExpectedDistrict(lat, lng, district)) return null;
  return `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}) is outside expected ${district} district bounds`;
}

export function addressMentionsWrongState(formattedAddress: string): boolean {
  const haystack = normalizeToken(formattedAddress);
  if (!haystack) return false;
  return WRONG_STATE_PATTERNS.some((pattern) => pattern.test(haystack));
}

/** District + Bihar required; block is a bonus, not required in address text. */
export function placeInExpectedAdminArea(
  formattedAddress: string,
  district: string,
  _block = '',
): boolean {
  const haystack = normalizeToken(formattedAddress);
  if (!haystack) return false;
  if (addressMentionsWrongState(haystack)) return false;
  if (!haystack.includes('bihar')) return false;

  const districtNorm = normalizeToken(district);
  if (!districtNorm || districtNorm.length < 3) return false;
  return tokenInHaystack(districtNorm, haystack);
}

export function villageTokensFromHint(village: string): string[] {
  const norm = normalizeToken(village);
  if (!norm) return [];
  const parts = norm.split(' ').filter((part) => part.length >= 3);
  const generic = new Set([
    'tola',
    'purvi',
    'paschim',
    'pashchim',
    'uttar',
    'dakshin',
    'mohalla',
    'ward',
    'gram',
    'gaon',
    'village',
  ]);
  return parts.filter((part) => !generic.has(part));
}

/** Require primary village token (e.g. SEHALO) — blocks Rajasthan "Paschim Tola" false matches. */
export function villageNameInResult(
  village: string,
  placeName: string,
  formattedAddress: string,
): boolean {
  const haystack = normalizeToken(`${placeName} ${formattedAddress}`);
  const villageNorm = normalizeToken(village);
  if (!villageNorm || !haystack) return false;
  if (haystack.includes(villageNorm)) return true;

  const tokens = villageTokensFromHint(village);
  if (!tokens.length) return tokenInHaystack(villageNorm, haystack);

  const primary = tokens[0];
  if (primary.length >= 4 && tokenInHaystack(primary, haystack)) {
    return true;
  }

  const matched = tokens.filter((token) => tokenInHaystack(token, haystack));
  return matched.length >= 2;
}

export function nominatimBiharViewbox(): string {
  return `${BIHAR_BOUNDS.minLng},${BIHAR_BOUNDS.maxLat},${BIHAR_BOUNDS.maxLng},${BIHAR_BOUNDS.minLat}`;
}
