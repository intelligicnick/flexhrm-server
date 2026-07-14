/** Street / house / hamlet — preferred for visit stamps. */
export const STREET_PLACE_FIELDS = [
  'house_number',
  'road',
  'pedestrian',
  'footway',
  'path',
] as const;

/** Local settlement fields finer than block / district. */
export const LOCALITY_PLACE_FIELDS = [
  'hamlet',
  'village',
  'isolated_dwelling',
  'neighbourhood',
  'quarter',
  'locality',
  'suburb',
  'city_district',
] as const;

/** Broader places — often the same as block in rural Bihar OSM data. */
export const BROAD_PLACE_FIELDS = ['town', 'city', 'municipality'] as const;

/** Fine-grained locality fields for visit photo stamps (village, street, etc.). */
export const FINE_PLACE_FIELDS = [
  ...STREET_PLACE_FIELDS,
  ...LOCALITY_PLACE_FIELDS,
  ...BROAD_PLACE_FIELDS,
] as const;

/** Administrative fields that often map to block/district — excluded from default stamp label. */
export const ADMIN_PLACE_FIELDS = [
  'county',
  'state_district',
  'state',
  'region',
  'district',
  'ISO3166-2-lvl4',
] as const;

export type SchoolGeocodeContext = {
  schoolWorkId?: string;
  block?: string;
  district?: string;
  schoolName?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: Record<string, string>;
  name?: string;
  addresstype?: string;
};

type PlaceCandidate = {
  label: string;
  source: string;
  isHistorical?: boolean;
  isSchoolHint?: boolean;
};

export function stripCoordsFromLocationLabel(label: string): string {
  return String(label || '')
    .replace(/\s*\([^)]*\d+\s*°[^)]*\)\s*$/i, '')
    .replace(/\s*·\s*-?\d+\.\d+,\s*-?\d+\.\d+\s*$/i, '')
    .trim();
}

function normalizeForCompare(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.\u0902]/g, '')
    .replace(/\s+/g, ' ');
}

/** Pull a village / locality hint from the school name (e.g. "N.P.S AOURA DIH" → "AOURA DIH"). */
export function localityHintFromSchoolName(schoolName: string): string {
  const trimmed = schoolName.trim();
  if (!trimmed) return '';

  // "BASIC SCHOOL DHIMA" → "DHIMA"
  const afterBasicSchool = trimmed.match(/^basic\s+school\s+(.+)$/i);
  if (afterBasicSchool?.[1]) {
    const locality = afterBasicSchool[1].trim();
    if (locality.length >= 3 && locality.length <= 80) return locality;
  }

  const schoolTypeToken =
    '(?:u\\.?\\s?h\\.?\\s?s\\.?|u\\.?\\s?m\\.?\\s?s\\.?|u\\.?\\s?p\\.?\\s?s\\.?|n\\.?\\s?p\\.?\\s?s\\.?|h\\.?\\s?s\\.?|m\\.?\\s?s\\.?|p\\.?\\s?s\\.?)';

  // "GUNANAND M S BISHNUPUR" → "BISHNUPUR", "KANYA P S BELGACHHI" → "BELGACHHI"
  const afterEmbeddedType = trimmed.match(
    new RegExp(`^.+\\s+${schoolTypeToken}\\s+(.+)$`, 'i'),
  );
  if (afterEmbeddedType?.[1]) {
    const locality = afterEmbeddedType[1]
      .replace(
        /\s+(school|vidyalaya|vidyalay|high\s+school|middle\s+school|primary\s+school)\s*$/i,
        '',
      )
      .trim();
    if (locality.length >= 3 && locality.length <= 80) {
      return locality;
    }
  }

  const withoutPrefix = trimmed
    .replace(/^basic\s+school\s+/i, '')
    .replace(
      /^(govt\.?|government|raja|adarsh|janta|kanya|n\.?\s?p\.?\s?s\.?|nps|u\.?\s?p\.?\s?s\.?|ups|u\.?\s?m\.?\s?s\.?|ums|m\.?\s?s\.?|p\.?\s?s\.?|ps|primary|middle|high|senior\s+secondary|secondary|h\.?\s?s\.?|hs|es|ss|kendra|kendriya)\s+/i,
      '',
    )
    .trim();

  let candidate = withoutPrefix !== trimmed ? withoutPrefix : trimmed;
  candidate = candidate
    .replace(
      /\s+(school|vidyalaya|vidyalay|high\s+school|middle\s+school|primary\s+school|hs|ms|ps|nps)\s*$/i,
      '',
    )
    .trim();

  // Drop trailing block / district words sometimes duplicated in the name
  if (candidate.length >= 3 && candidate.length <= 80) {
    return candidate;
  }
  return '';
}

function labelParts(label: string): string[] {
  return stripCoordsFromLocationLabel(label)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * True when the label is only the block / district (e.g. "Alamnagar" or
 * "Alamnagar, Madhepura, Bihar") — not a useful local village/street.
 */
export function isBlockScaleLabel(
  label: string,
  context?: SchoolGeocodeContext,
): boolean {
  const parts = labelParts(label);
  if (parts.length === 0) return true;

  const skip = new Set<string>([
    'india',
    'भारत',
    'bihar',
    'jharkhand',
    'uttar pradesh',
    'west bengal',
    'madhya pradesh',
  ]);
  if (context?.block) skip.add(normalizeForCompare(context.block));
  if (context?.district) {
    skip.add(normalizeForCompare(context.district));
    skip.add(normalizeForCompare(`${context.district} district`));
  }

  const meaningful = parts.filter(
    (part) =>
      !skip.has(normalizeForCompare(part)) && !/^\d{6}$/.test(part),
  );

  if (meaningful.length === 0) return true;

  // Single remaining token that equals the block/"Alamnagar" style admin name
  if (meaningful.length === 1) {
    const only = normalizeForCompare(meaningful[0]);
    if (context?.block && only === normalizeForCompare(context.block)) {
      return true;
    }
    if (context?.district && only === normalizeForCompare(context.district)) {
      return true;
    }
    // OSM often uses village=Alamnagar when Alamnagar is also the block
    if (context?.block && only.includes(normalizeForCompare(context.block))) {
      return only === normalizeForCompare(context.block) ||
        only === normalizeForCompare(`${context.block} block`);
    }
  }

  return false;
}

function isBlockOrDistrictOnly(
  label: string,
  context?: SchoolGeocodeContext,
): boolean {
  return isBlockScaleLabel(label, context);
}

function dropAdminTokens(
  parts: string[],
  context?: SchoolGeocodeContext,
): string[] {
  const skip = new Set<string>(['india', 'भारत', 'bihar']);
  if (context?.block) skip.add(normalizeForCompare(context.block));
  if (context?.district) {
    skip.add(normalizeForCompare(context.district));
    skip.add(normalizeForCompare(`${context.district} district`));
  }

  return parts.filter((part) => {
    if (!part) return false;
    const lower = normalizeForCompare(part);
    if (skip.has(lower)) return false;
    if (/^\d{6}$/.test(part)) return false;
    if (/^bihar$/i.test(part)) return false;
    return true;
  });
}

export function buildPlaceNameFromAddress(
  address: Record<string, string> | undefined,
  options?: {
    allowAdminFallback?: boolean;
    context?: SchoolGeocodeContext;
  },
): string {
  if (!address) return '';
  const context = options?.context;

  const streetParts = STREET_PLACE_FIELDS.map((key) =>
    String(address[key] ?? '').trim(),
  ).filter(Boolean);

  const localityParts = LOCALITY_PLACE_FIELDS.map((key) =>
    String(address[key] ?? '').trim(),
  ).filter(Boolean);

  // Drop locality that is only the block name (common OSM miss for rural areas)
  const fineLocality = localityParts.filter(
    (part) => !isBlockScaleLabel(part, context),
  );

  const combined = [...new Set([...streetParts, ...fineLocality])];
  if (combined.length > 0) {
    return combined.slice(0, 3).join(', ');
  }

  // Broad town/city — only if it is NOT just the block name
  const broadParts = BROAD_PLACE_FIELDS.map((key) =>
    String(address[key] ?? '').trim(),
  ).filter((part) => part && !isBlockScaleLabel(part, context));
  if (broadParts.length > 0) {
    return [...new Set(broadParts)].slice(0, 2).join(', ');
  }

  if (options?.allowAdminFallback) {
    const adminParts = ADMIN_PLACE_FIELDS.map((key) =>
      String(address[key] ?? '').trim(),
    ).filter(Boolean);
    const uniqueAdmin = [...new Set(adminParts)];
    if (uniqueAdmin.length > 0) {
      return uniqueAdmin.slice(0, 2).join(', ');
    }
  }

  return '';
}

export function buildPlaceNameFromDisplayName(
  displayName: string,
  context?: SchoolGeocodeContext,
): string {
  const parts = dropAdminTokens(
    displayName.split(',').map((part) => part.trim()),
    context,
  );
  const result = parts.slice(0, 3).join(', ');
  if (!result || isBlockScaleLabel(result, context)) return '';
  return result;
}

function scorePlaceCandidate(
  label: string,
  context?: SchoolGeocodeContext,
  meta?: { isHistorical?: boolean; isSchoolHint?: boolean },
): number {
  const trimmed = label.trim();
  if (!trimmed) return -1;
  if (isBlockScaleLabel(trimmed, context)) return 0;

  let score = 5;
  if (meta?.isHistorical) score += 20;
  if (meta?.isSchoolHint) score += 4;

  if (/road|rd\.|street|st\.|गली|marg|path|lane|chowk/i.test(trimmed)) {
    score += 25;
  }

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) score += 15;
  if (parts.length >= 3) score += 5;

  if (/village|hamlet|गाँव|गांव|locality|neighbourhood|dih|tola|tole/i.test(trimmed)) {
    score += 12;
  }

  // Prefer names that look like a local settlement, not the block alone
  if (
    context?.block &&
    normalizeForCompare(parts[0] || '') === normalizeForCompare(context.block)
  ) {
    score -= 30;
  }

  score += Math.min(parts.length * 3, 12);
  return score;
}

function pickBestCandidate(
  candidates: PlaceCandidate[],
  context?: SchoolGeocodeContext,
): string {
  let best = '';
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!candidate.label.trim()) continue;
    const score = scorePlaceCandidate(candidate.label, context, {
      isHistorical: candidate.isHistorical,
      isSchoolHint: candidate.isSchoolHint,
    });
    if (score > bestScore) {
      bestScore = score;
      best = candidate.label.trim();
    }
  }

  return bestScore > 0 ? best : '';
}

function addNominatimCandidates(
  candidates: PlaceCandidate[],
  result: NominatimResponse | null,
  sourcePrefix: string,
  context?: SchoolGeocodeContext,
): void {
  if (!result) return;

  const fromAddress = buildPlaceNameFromAddress(result.address, { context });
  if (fromAddress && !isBlockScaleLabel(fromAddress, context)) {
    candidates.push({ label: fromAddress, source: `${sourcePrefix}-address` });
  }

  const displayName = String(result.display_name || '').trim();
  if (displayName) {
    const fromDisplay = buildPlaceNameFromDisplayName(displayName, context);
    if (fromDisplay) {
      candidates.push({ label: fromDisplay, source: `${sourcePrefix}-display` });
    }
  }
}

async function fetchNominatim(
  lat: number,
  lng: number,
  options?: { layer?: string; language?: string; zoom?: number },
): Promise<NominatimResponse | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', options?.language ?? 'en');
    url.searchParams.set('zoom', String(options?.zoom ?? 18));
    if (options?.layer) {
      url.searchParams.set('layer', options.layer);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FlexHRM-Supervisor/1.0',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimResponse;
  } catch {
    return null;
  }
}

async function fetchGooglePlaceName(
  lat: number,
  lng: number,
  apiKey: string,
  context?: SchoolGeocodeContext,
): Promise<string> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'en');
    url.searchParams.set('result_type', 'route|sublocality|neighborhood|premise|street_address|colloquial_area');

    const res = await fetch(url.toString());
    if (!res.ok) return '';

    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    if (data.status !== 'OK' || !data.results?.length) return '';

    for (const result of data.results) {
      const byType: Record<string, string> = {};
      for (const comp of result.address_components ?? []) {
        for (const type of comp.types) {
          if (!byType[type]) {
            byType[type] = comp.long_name;
          }
        }
      }

      const pseudoAddress: Record<string, string> = {
        house_number: byType.street_number ?? '',
        road: byType.route ?? '',
        village: byType.sublocality_level_2 ?? byType.sublocality ?? '',
        neighbourhood: byType.neighborhood ?? '',
        locality: byType.locality ?? '',
        suburb: byType.sublocality_level_1 ?? '',
        town: byType.postal_town ?? '',
        city: byType.administrative_area_level_2 ?? '',
      };
      const built = buildPlaceNameFromAddress(pseudoAddress, { context });
      if (built && !isBlockScaleLabel(built, context)) return built;
    }

    return '';
  } catch {
    return '';
  }
}

async function fetchOpenCagePlaceName(
  lat: number,
  lng: number,
  apiKey: string,
  context?: SchoolGeocodeContext,
): Promise<string> {
  try {
    const url = new URL('https://api.opencagedata.com/geocode/v1/json');
    url.searchParams.set('q', `${lat}+${lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'en');
    url.searchParams.set('no_annotations', '1');

    const res = await fetch(url.toString());
    if (!res.ok) return '';

    const data = (await res.json()) as {
      results?: Array<{ components?: Record<string, string> }>;
    };
    const components = data.results?.[0]?.components;
    if (!components) return '';

    const pseudoAddress: Record<string, string> = {
      house_number: components.house_number ?? '',
      road: components.road ?? '',
      hamlet: components.hamlet ?? '',
      village: components.village ?? '',
      neighbourhood: components.neighbourhood ?? '',
      locality: components.locality ?? '',
      suburb: components.suburb ?? '',
      town: components.town ?? '',
      city: components.city ?? components.city_district ?? '',
    };
    const built = buildPlaceNameFromAddress(pseudoAddress, { context });
    if (built && !isBlockScaleLabel(built, context)) return built;
    return '';
  } catch {
    return '';
  }
}

export async function resolveReverseGeocodePlaceName(
  lat: number,
  lng: number,
  options?: {
    googleApiKey?: string;
    openCageApiKey?: string;
    schoolContext?: SchoolGeocodeContext;
    historicalMatch?: string;
  },
): Promise<string> {
  const context = options?.schoolContext;
  const candidates: PlaceCandidate[] = [];

  // School-derived village always competes — OSM often has no street/hamlet in rural India
  const schoolName = String(context?.schoolName || '').trim();
  if (schoolName) {
    const hint = localityHintFromSchoolName(schoolName);
    if (hint && !isBlockScaleLabel(hint, context)) {
      candidates.push({
        label: hint,
        source: 'school-name-hint',
        isSchoolHint: true,
      });
    }
  }

  const historical = stripCoordsFromLocationLabel(
    String(options?.historicalMatch || ''),
  );
  if (historical && !isBlockScaleLabel(historical, context)) {
    candidates.push({
      label: historical,
      source: 'historical-gps',
      isHistorical: true,
    });
  }

  const [nominatimEn, nominatimHi, addressLayerEn, addressLayerHi, zoomStreet] =
    await Promise.all([
      fetchNominatim(lat, lng, { language: 'en', zoom: 18 }),
      fetchNominatim(lat, lng, { language: 'hi', zoom: 18 }),
      fetchNominatim(lat, lng, { layer: 'address', language: 'en', zoom: 18 }),
      fetchNominatim(lat, lng, { layer: 'address', language: 'hi', zoom: 18 }),
      fetchNominatim(lat, lng, { language: 'en', zoom: 19 }),
    ]);

  addNominatimCandidates(candidates, nominatimEn, 'nominatim-en', context);
  addNominatimCandidates(candidates, nominatimHi, 'nominatim-hi', context);
  addNominatimCandidates(
    candidates,
    addressLayerEn,
    'nominatim-address-en',
    context,
  );
  addNominatimCandidates(
    candidates,
    addressLayerHi,
    'nominatim-address-hi',
    context,
  );
  addNominatimCandidates(candidates, zoomStreet, 'nominatim-street-zoom', context);

  const googleKey = options?.googleApiKey?.trim();
  if (googleKey) {
    const googlePlace = await fetchGooglePlaceName(lat, lng, googleKey, context);
    if (googlePlace) {
      candidates.push({ label: googlePlace, source: 'google' });
    }
  }

  const openCageKey = options?.openCageApiKey?.trim();
  if (openCageKey) {
    const openCagePlace = await fetchOpenCagePlaceName(
      lat,
      lng,
      openCageKey,
      context,
    );
    if (openCagePlace) {
      candidates.push({ label: openCagePlace, source: 'opencage' });
    }
  }

  const best = pickBestCandidate(candidates, context);
  if (best) return best;

  return '';
}
