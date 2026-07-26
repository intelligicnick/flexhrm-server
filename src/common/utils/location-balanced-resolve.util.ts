import { coordinatesInExpectedDistrict } from './bihar-geography.util';
import { validatePinForBlock } from './block-pin-gate.util';
import type { ExternalSchoolRecord } from './external-school-registry.util';
import {
  getDramitKumarBlockIndex,
  warmBlockRegistryIndex,
} from './external-school-registry.util';
import type { ResolvedSchoolPlace, SchoolResolveSuccessReason } from './google-school-place.util';
import { placeInExpectedAdminArea } from './google-school-place.util';
import { tryOneFiveNineDirectPath } from './onefivenine-village.util';
import { villagePinToSchoolPlace, type ResolvedVillagePin } from './village-location.util';

export { warmBlockRegistryIndex, getDramitKumarBlockIndex };

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueVillageLabels(...values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (v.length < 3) continue;
    const key = normalizeToken(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function pinPassesFastVillageGate(
  pin: ResolvedVillagePin,
  villageLabel: string,
  block: string,
  district: string,
): boolean {
  if (!coordinatesInExpectedDistrict(pin.lat, pin.lng, district)) return false;
  if (!placeInExpectedAdminArea(pin.formattedAddress, block, district)) return false;
  const villageNorm = normalizeToken(villageLabel);
  const haystack = normalizeToken(`${pin.placeName} ${pin.formattedAddress}`);
  if (villageNorm && villageNorm.length >= 4 && !haystack.includes(villageNorm)) {
    return false;
  }
  return true;
}

/**
 * When dramitkumar GPS fails the block gate (wrong district/outlier) but village name is known,
 * resolve village centroid via onefivenine direct path in the correct block.
 */
export async function tryRegistryVillageFallback(params: {
  external: ExternalSchoolRecord;
  block: string;
  district: string;
  villageHint: string;
  siblingBlocks?: string[];
  apiKey?: string;
  fastMode?: boolean;
}): Promise<{
  match: ResolvedSchoolPlace | null;
  successReason?: SchoolResolveSuccessReason;
  villageUsed?: string;
  stepsTried: string[];
}> {
  const block = String(params.block || '').trim();
  const district = String(params.district || '').trim();
  const siblingBlocks = params.siblingBlocks ?? [];
  const fastMode = params.fastMode === true;
  const stepsTried: string[] = ['registry_village_fallback'];
  const villages = uniqueVillageLabels(
    params.external.village,
    params.villageHint,
    params.external.panchayat,
  );

  if (!villages.length) {
    stepsTried.push('registry_village_fallback_no_hint');
    return { match: null, stepsTried };
  }

  for (const villageLabel of villages) {
    stepsTried.push(`registry_village_try:${villageLabel}`);
    const directPin = await tryOneFiveNineDirectPath(district, block, villageLabel, fastMode);
    if (!directPin) continue;

    if (fastMode) {
      if (!pinPassesFastVillageGate(directPin, villageLabel, block, district)) {
        stepsTried.push(`registry_village_fast_reject:${villageLabel}`);
        continue;
      }
      return {
        match: villagePinToSchoolPlace(directPin),
        successReason: 'village_on_onefivenine_direct',
        villageUsed: villageLabel,
        stepsTried,
      };
    }

    const gate = await validatePinForBlock({
      lat: directPin.lat,
      lng: directPin.lng,
      block,
      district,
      villageHint: villageLabel,
      siblingBlocks,
      formattedAddress: directPin.formattedAddress,
      placeName: directPin.placeName,
      sourceBlockSegment: directPin.formattedAddress.split(',')[1]?.trim(),
      apiKey: params.apiKey,
      requireGoogle: Boolean(params.apiKey),
    });

    if (gate.ok) {
      const match = villagePinToSchoolPlace({
        ...directPin,
        formattedAddress: gate.formattedAddress || directPin.formattedAddress,
        placeName: gate.placeName || directPin.placeName,
      });
      return {
        match,
        successReason: 'village_on_onefivenine_direct',
        villageUsed: villageLabel,
        stepsTried,
      };
    }
    stepsTried.push(`registry_village_gate_reject:${villageLabel}:${gate.reason || 'unknown'}`);
  }

  stepsTried.push('registry_village_fallback_miss');
  return { match: null, stepsTried };
}
