import type { SchoolResolveSuccessReason } from './google-school-place.util';
import { resolveGoogleVillageByName } from './google-school-place.util';
import {
  resolveOneFiveNineVillagePin,
  tryOneFiveNineDirectPath,
  villageSearchCombinationsFromSchoolName,
} from './onefivenine-village.util';
import { localityHintFromSchoolName } from './reverse-geocode.util';
import {
  enrichPinWithGoogleReverseGeocode,
  resolveOsmVillageCombo,
  resolveVillagePin,
  type ResolvedVillagePin,
  villagePinToSchoolPlace,
} from './village-location.util';

export type BlockVillageCache = Map<string, ResolvedVillagePin>;

const sessionVillageCaches = new Map<string, BlockVillageCache>();

/** Reuse village pins across schools in the same block during bulk resolve batches. */
export function getSessionVillageCache(district: string, block: string): BlockVillageCache {
  const key = `${normalizeToken(district)}|${normalizeToken(block)}`;
  let cache = sessionVillageCaches.get(key);
  if (!cache) {
    cache = new Map();
    sessionVillageCaches.set(key, cache);
  }
  return cache;
}

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function blockVillageCacheKey(
  district: string,
  block: string,
  villageLabel: string,
): string {
  return `${normalizeToken(district)}|${normalizeToken(block)}|${normalizeToken(villageLabel)}`;
}

export type VillageOrchestratorResult = {
  pin: ResolvedVillagePin | null;
  successReason?: SchoolResolveSuccessReason;
  villageHint: string;
  stepsTried: string[];
};

function schoolPlaceToVillagePin(
  match: {
    lat: number;
    lng: number;
    placeName: string;
    formattedAddress: string;
    googleMapsUrl: string;
    locationSource: ResolvedVillagePin['locationSource'];
    geofenceRadiusM: number;
    queryUsed: string;
    matchScore?: number;
  },
  resolutionStep: ResolvedVillagePin['resolutionStep'],
): ResolvedVillagePin {
  return {
    lat: match.lat,
    lng: match.lng,
    placeName: match.placeName,
    formattedAddress: match.formattedAddress,
    googleMapsUrl: match.googleMapsUrl,
    locationSource: match.locationSource,
    locationConfidence: 'village',
    geofenceRadiusM: match.geofenceRadiusM,
    queryUsed: match.queryUsed,
    matchScore: match.matchScore || 60,
    resolutionStep,
  };
}

async function finalizePin(
  pin: ResolvedVillagePin,
  villageLabel: string,
  district: string,
  block: string,
  apiKey: string,
  siblingBlocks: string[] = [],
): Promise<ResolvedVillagePin | null> {
  return enrichPinWithGoogleReverseGeocode(
    pin,
    villageLabel,
    district,
    block,
    apiKey,
    siblingBlocks,
  );
}

function cachePin(
  cache: BlockVillageCache | undefined,
  district: string,
  block: string,
  villageLabel: string,
  pin: ResolvedVillagePin,
): void {
  if (!cache) return;
  cache.set(blockVillageCacheKey(district, block, villageLabel), pin);
}

function successFromPin(
  pin: ResolvedVillagePin,
  successReason: SchoolResolveSuccessReason,
  villageHint: string,
  stepsTried: string[],
): VillageOrchestratorResult {
  return { pin, successReason, villageHint, stepsTried };
}

export async function resolveVillageMultiSource(params: {
  schoolName: string;
  block: string;
  district: string;
  siblingBlocks?: string[];
  apiKey?: string;
  villageCache?: BlockVillageCache;
}): Promise<VillageOrchestratorResult> {
  const schoolName = String(params.schoolName || '').trim();
  const block = String(params.block || '').trim();
  const district = String(params.district || '').trim();
  const siblingBlocks = params.siblingBlocks ?? [];
  const apiKey = String(
    params.apiKey ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      '',
  ).trim();
  const stepsTried: string[] = [];
  const combos = villageSearchCombinationsFromSchoolName(schoolName);
  const villageHint = localityHintFromSchoolName(schoolName) || combos[combos.length - 1] || '';

  if (!combos.length && !villageHint) {
    return { pin: null, villageHint, stepsTried };
  }

  const cacheCandidates = [...new Set([villageHint, ...combos].filter(Boolean))];
  stepsTried.push('block_village_cache');
  for (const label of cacheCandidates) {
    const cached = params.villageCache?.get(blockVillageCacheKey(district, block, label));
    if (!cached) continue;
    stepsTried.push(`cache_hit:${label}`);
    const pin = await finalizePin(
      { ...cached, resolutionStep: 'block_cache', queryUsed: `cache:${label}` },
      label,
      district,
      block,
      apiKey,
      siblingBlocks,
    );
    if (pin) {
      return successFromPin(pin, 'village_from_block_cache', villageHint || label, stepsTried);
    }
    stepsTried.push(`cache_reject_block_gate:${label}`);
  }
  stepsTried.push('block_village_cache_miss');

  stepsTried.push('onefivenine_direct_paths');
  for (const combo of combos) {
    const directPin = await tryOneFiveNineDirectPath(district, block, combo);
    if (!directPin) continue;
    stepsTried.push(`onefivenine_direct:${combo}`);
    const pin = await finalizePin(directPin, combo, district, block, apiKey, siblingBlocks);
    if (pin) {
      cachePin(params.villageCache, district, block, combo, pin);
      return successFromPin(pin, 'village_on_onefivenine_direct', villageHint || combo, stepsTried);
    }
    stepsTried.push(`onefivenine_direct_reject:${combo}`);
  }
  stepsTried.push('onefivenine_direct_miss');

  stepsTried.push('onefivenine_village_combos');
  const oneFiveNine = await resolveOneFiveNineVillagePin(schoolName, block, district, siblingBlocks);
  if (oneFiveNine.pin) {
    stepsTried.push(`onefivenine_hit:${oneFiveNine.queryUsed}`);
    const pin = await finalizePin(
      oneFiveNine.pin,
      villageHint || oneFiveNine.villageHint,
      district,
      block,
      apiKey,
      siblingBlocks,
    );
    if (pin) {
      cachePin(params.villageCache, district, block, villageHint || oneFiveNine.villageHint, pin);
      return successFromPin(pin, 'village_on_onefivenine', oneFiveNine.villageHint || villageHint, stepsTried);
    }
    stepsTried.push('onefivenine_reject_block_gate');
  }
  stepsTried.push('onefivenine_village_miss');

  if (apiKey) {
    stepsTried.push('google_village_combos');
    for (const combo of combos) {
      const googleMatch = await resolveGoogleVillageByName(
        combo,
        block,
        district,
        apiKey,
        siblingBlocks,
      );
      if (!googleMatch) continue;
      stepsTried.push(`google_combo:${combo}`);
      const rawPin = schoolPlaceToVillagePin(
        {
          ...googleMatch,
          locationSource:
            googleMatch.locationSource === 'google_places' ? 'google_places' : 'google_geocode',
        },
        'google_combo',
      );
      const pin = await finalizePin(rawPin, combo, district, block, apiKey, siblingBlocks);
      if (pin) {
        cachePin(params.villageCache, district, block, combo, pin);
        return successFromPin(pin, 'village_on_google_combo', villageHint || combo, stepsTried);
      }
      stepsTried.push(`google_combo_reject:${combo}`);
    }
    stepsTried.push('google_village_combos_miss');
  }

  stepsTried.push('osm_village_combos');
  for (const combo of combos) {
    const osmPin = await resolveOsmVillageCombo(combo, block, district);
    if (!osmPin) continue;
    stepsTried.push(`osm_combo:${combo}`);
    const pin = await finalizePin(osmPin, combo, district, block, apiKey, siblingBlocks);
    if (pin) {
      cachePin(params.villageCache, district, block, combo, pin);
      return successFromPin(pin, 'village_on_osm_combo', villageHint || combo, stepsTried);
    }
    stepsTried.push(`osm_combo_reject:${combo}`);
  }
  stepsTried.push('osm_village_combos_miss');

  stepsTried.push('village_pin_util');
  for (const combo of combos) {
    const { pin: utilPin } = await resolveVillagePin(combo, block, district, apiKey);
    if (!utilPin) continue;
    stepsTried.push(`village_util:${combo}`);
    const pin = await finalizePin(utilPin, combo, district, block, apiKey, siblingBlocks);
    if (pin) {
      const reason: SchoolResolveSuccessReason =
        utilPin.resolutionStep === 'osm_village' ? 'village_on_osm' : 'village_on_google';
      cachePin(params.villageCache, district, block, combo, pin);
      return successFromPin(pin, reason, villageHint || combo, stepsTried);
    }
    stepsTried.push(`village_util_reject:${combo}`);
  }
  stepsTried.push('village_pin_util_miss');

  return { pin: null, villageHint, stepsTried };
}

export function villageOrchestratorResultToSchoolPlace(
  result: VillageOrchestratorResult,
): ReturnType<typeof villagePinToSchoolPlace> | null {
  if (!result.pin) return null;
  return villagePinToSchoolPlace(result.pin);
}
