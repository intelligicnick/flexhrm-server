import {
  coordinatesInBihar,
  coordinatesInExpectedDistrict,
  tokenInHaystack,
  villageNameInResult,
} from './bihar-geography.util';
import {
  adminAreaMismatchReason,
  placeInExpectedAdminArea,
} from './google-school-place.util';
import { blockGateFetchTimeoutMs } from './location-resolve-timing.util';

export type BlockPinGateResult = {
  ok: boolean;
  reason?: string;
  formattedAddress?: string;
  placeName?: string;
  verifiedViaGoogle?: boolean;
};

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveGoogleApiKey(apiKey?: string): string {
  return String(
    apiKey ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      '',
  ).trim();
}

async function reverseGeocodeGoogle(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<{ formattedAddress: string; placeName: string } | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'in');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(blockGateFetchTimeoutMs()) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    };
    if (data.status !== 'OK' || !data.results?.length) return null;
    const result = data.results[0];
    const formattedAddress = String(result.formatted_address || '').trim();
    const locality =
      result.address_components?.find((c) =>
        (c.types || []).some((t) =>
          ['locality', 'village', 'hamlet', 'neighbourhood', 'sublocality'].includes(t),
        ),
      )?.long_name || '';
    return {
      formattedAddress,
      placeName: String(locality || formattedAddress.split(',')[0] || '').trim(),
    };
  } catch {
    return null;
  }
}

/** Block segment from onefivenine path must match the school block (Amour ≠ Bhawanipur block). */
export function oneFiveNineBlockSegmentMatches(
  blockSegment: string,
  expectedBlock: string,
): boolean {
  const expected = normalizeToken(expectedBlock);
  const segment = normalizeToken(blockSegment);
  if (!expected || !segment) return false;
  if (segment === expected) return true;
  return tokenInHaystack(expected, segment) || tokenInHaystack(segment, expected);
}

/** Village name equals another block name in the district — homonym risk (Bhawanipur village vs Bhawanipur block). */
export function villageNameCollidesWithOtherBlock(
  village: string,
  expectedBlock: string,
  siblingBlocks: string[] = [],
): boolean {
  const villageNorm = normalizeToken(village);
  const expectedNorm = normalizeToken(expectedBlock);
  if (!villageNorm || villageNorm.length < 4) return false;
  for (const sibling of siblingBlocks) {
    const siblingNorm = normalizeToken(sibling);
    if (!siblingNorm || siblingNorm.length < 4) continue;
    if (siblingNorm === expectedNorm) continue;
    if (villageNorm === siblingNorm || tokenInHaystack(siblingNorm, villageNorm)) {
      return true;
    }
  }
  return false;
}

function validateAddressText(
  formattedAddress: string,
  placeName: string,
  block: string,
  district: string,
  villageHint: string,
  siblingBlocks: string[],
): BlockPinGateResult {
  if (!formattedAddress.trim()) {
    return { ok: false, reason: 'empty_address' };
  }

  const adminReason = adminAreaMismatchReason(
    formattedAddress,
    block,
    district,
    siblingBlocks,
  );
  if (adminReason) {
    return { ok: false, reason: adminReason };
  }

  if (!placeInExpectedAdminArea(formattedAddress, block, district, siblingBlocks)) {
    return { ok: false, reason: `Block "${block}" not confirmed in address` };
  }

  if (
    villageHint &&
    !villageNameInResult(villageHint, placeName, formattedAddress)
  ) {
    return { ok: false, reason: `Village "${villageHint}" not in Google/place address` };
  }

  return {
    ok: true,
    formattedAddress,
    placeName,
  };
}

/** Final judge: Google reverse geocode + strict block/district/village checks. */
export async function validatePinForBlock(params: {
  lat: number;
  lng: number;
  block: string;
  district: string;
  villageHint?: string;
  siblingBlocks?: string[];
  formattedAddress?: string;
  placeName?: string;
  sourceBlockSegment?: string;
  apiKey?: string;
  requireGoogle?: boolean;
}): Promise<BlockPinGateResult> {
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const block = String(params.block || '').trim();
  const district = String(params.district || '').trim();
  const villageHint = String(params.villageHint || '').trim();
  const siblingBlocks = params.siblingBlocks ?? [];

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'invalid_coordinates' };
  }
  if (!coordinatesInBihar(lat, lng)) {
    return { ok: false, reason: 'outside_bihar' };
  }
  if (district && !coordinatesInExpectedDistrict(lat, lng, district)) {
    return { ok: false, reason: `GPS outside expected ${district} district bounds` };
  }

  if (params.sourceBlockSegment && block) {
    if (!oneFiveNineBlockSegmentMatches(params.sourceBlockSegment, block)) {
      return {
        ok: false,
        reason: `Source block "${params.sourceBlockSegment}" ≠ expected "${block}"`,
      };
    }
  }

  if (
    villageHint &&
    villageNameCollidesWithOtherBlock(villageHint, block, siblingBlocks) &&
    params.sourceBlockSegment &&
    !oneFiveNineBlockSegmentMatches(params.sourceBlockSegment, block)
  ) {
    return {
      ok: false,
      reason: `Homonym village "${villageHint}" matches another block name — block path must be "${block}"`,
    };
  }

  const key = resolveGoogleApiKey(params.apiKey);
  if (key) {
    const reversed = await reverseGeocodeGoogle(lat, lng, key);
    if (reversed) {
      const textResult = validateAddressText(
        reversed.formattedAddress,
        reversed.placeName,
        block,
        district,
        villageHint,
        siblingBlocks,
      );
      if (textResult.ok) {
        return {
          ...textResult,
          verifiedViaGoogle: true,
        };
      }
      return { ...textResult, verifiedViaGoogle: true };
    }
    if (params.requireGoogle !== false) {
      return { ok: false, reason: 'Google reverse geocode failed — cannot confirm block' };
    }
  }

  const fallbackAddress = String(params.formattedAddress || '').trim();
  if (!fallbackAddress) {
    return {
      ok: false,
      reason: key
        ? 'Google reverse geocode failed and no fallback address'
        : 'No Google API key and no fallback address for block check',
    };
  }

  const fallbackResult = validateAddressText(
    fallbackAddress,
    String(params.placeName || ''),
    block,
    district,
    villageHint,
    siblingBlocks,
  );
  return { ...fallbackResult, verifiedViaGoogle: false };
}

export async function validateSchoolPlaceForBlock(params: {
  lat: number;
  lng: number;
  placeName?: string;
  formattedAddress?: string;
  block: string;
  district: string;
  villageHint?: string;
  siblingBlocks?: string[];
  sourceBlockSegment?: string;
  apiKey?: string;
}): Promise<BlockPinGateResult> {
  return validatePinForBlock({
    ...params,
    requireGoogle: true,
  });
}
