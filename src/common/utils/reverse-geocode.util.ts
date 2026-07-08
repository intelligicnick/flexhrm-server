/** Fine-grained locality fields for visit photo stamps (village, street, etc.). */
export const FINE_PLACE_FIELDS = [
  'house_number',
  'road',
  'hamlet',
  'village',
  'isolated_dwelling',
  'neighbourhood',
  'locality',
  'suburb',
  'town',
  'city',
] as const;

/** Administrative fields that often map to block/district — excluded from default stamp label. */
export const ADMIN_PLACE_FIELDS = [
  'county',
  'state_district',
  'state',
  'region',
  'district',
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
};

type PlaceCandidate = {
  label: string;
  source: string;
  isHistorical?: boolean;
};

export function stripCoordsFromLocationLabel(label: string): string {
  return String(label || '')
    .replace(/\s*\([^)]*\d+\s*°[^)]*\)\s*$/i, '')
    .trim();
}

export function localityHintFromSchoolName(schoolName: string): string {
  const trimmed = schoolName.trim();
  if (!trimmed) return '';

  const stripped = trimmed
    .replace(
      /^(govt\.?|government|ups|ps|ums|u\.?m\.?s\.?|p\.?s\.?|primary|middle|high|ms|es)\s+/i,
      '',
    )
    .trim();

  if (stripped.length >= 3 && stripped.length <= 60 && stripped !== trimmed) {
    return stripped;
  }

  const withoutSchool = trimmed
    .replace(/\s+(school|vidyalaya|hs|ms|ps)\s*$/i, '')
    .trim();
  if (withoutSchool.length >= 3 && withoutSchool.length <= 50) {
    return withoutSchool;
  }

  return '';
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase();
}

function isBlockOrDistrictOnly(
  label: string,
  context?: SchoolGeocodeContext,
): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  const lower = normalizeForCompare(trimmed);
  if (context?.block && lower === normalizeForCompare(context.block)) {
    return true;
  }
  if (context?.district && lower === normalizeForCompare(context.district)) {
    return true;
  }
  return false;
}

export function buildPlaceNameFromAddress(
  address: Record<string, string> | undefined,
  options?: { allowAdminFallback?: boolean },
): string {
  if (!address) return '';

  const fineParts = FINE_PLACE_FIELDS.map((key) =>
    String(address[key] ?? '').trim(),
  ).filter(Boolean);
  const uniqueFine = [...new Set(fineParts)];
  if (uniqueFine.length > 0) {
    return uniqueFine.slice(0, 3).join(', ');
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
  const skip = new Set<string>(['india', 'भारत']);
  if (context?.block) skip.add(normalizeForCompare(context.block));
  if (context?.district) skip.add(normalizeForCompare(context.district));

  const parts = displayName
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const lower = normalizeForCompare(part);
      if (skip.has(lower)) return false;
      if (/^\d{6}$/.test(part)) return false;
      if (/^bihar$/i.test(part)) return false;
      return true;
    });

  const result = parts.slice(0, 3).join(', ');
  if (isBlockOrDistrictOnly(result, context)) return '';
  return result;
}

function scorePlaceCandidate(
  label: string,
  context?: SchoolGeocodeContext,
  isHistorical = false,
): number {
  const trimmed = label.trim();
  if (!trimmed) return -1;
  if (isBlockOrDistrictOnly(trimmed, context)) return 0;

  let score = 5;
  if (isHistorical) score += 25;

  if (/road|rd\.|street|st\.|गली|marg|path/i.test(trimmed)) score += 20;

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) score += 15;
  if (parts.length >= 3) score += 5;

  if (/village|hamlet|गाँव|गांव|locality|neighbourhood/i.test(trimmed)) {
    score += 10;
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
    const score = scorePlaceCandidate(
      candidate.label,
      context,
      candidate.isHistorical,
    );
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

  const fromAddress = buildPlaceNameFromAddress(result.address);
  if (fromAddress) {
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
  options?: { layer?: string; language?: string },
): Promise<NominatimResponse | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('accept-language', options?.language ?? 'en');
    url.searchParams.set('zoom', '18');
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
): Promise<string> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'en');

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
      const built = buildPlaceNameFromAddress(pseudoAddress);
      if (built) return built;
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
    return buildPlaceNameFromAddress(pseudoAddress);
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

  const historical = String(options?.historicalMatch || '').trim();
  if (historical) {
    candidates.push({
      label: historical,
      source: 'historical-gps',
      isHistorical: true,
    });
  }

  const [nominatimEn, nominatimHi, addressLayerEn, addressLayerHi] =
    await Promise.all([
      fetchNominatim(lat, lng, { language: 'en' }),
      fetchNominatim(lat, lng, { language: 'hi' }),
      fetchNominatim(lat, lng, { layer: 'address', language: 'en' }),
      fetchNominatim(lat, lng, { layer: 'address', language: 'hi' }),
    ]);

  addNominatimCandidates(candidates, nominatimEn, 'nominatim-en', context);
  addNominatimCandidates(candidates, nominatimHi, 'nominatim-hi', context);
  addNominatimCandidates(candidates, addressLayerEn, 'nominatim-address-en', context);
  addNominatimCandidates(candidates, addressLayerHi, 'nominatim-address-hi', context);

  const schoolName = String(context?.schoolName || '').trim();
  if (schoolName) {
    const hint = localityHintFromSchoolName(schoolName);
    if (hint) {
      candidates.push({ label: hint, source: 'school-name-hint' });
    }
  }

  const googleKey = options?.googleApiKey?.trim();
  if (googleKey) {
    const googlePlace = await fetchGooglePlaceName(lat, lng, googleKey);
    if (googlePlace) {
      candidates.push({ label: googlePlace, source: 'google' });
    }
  }

  const openCageKey = options?.openCageApiKey?.trim();
  if (openCageKey) {
    const openCagePlace = await fetchOpenCagePlaceName(lat, lng, openCageKey);
    if (openCagePlace) {
      candidates.push({ label: openCagePlace, source: 'opencage' });
    }
  }

  return pickBestCandidate(candidates, context);
}
