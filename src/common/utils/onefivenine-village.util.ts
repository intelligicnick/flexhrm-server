import {
  coordinatesInBihar,
  placeInExpectedAdminArea,
  tokenInHaystack,
  villageNameInResult,
} from './bihar-geography.util';
import { localityHintFromSchoolName } from './reverse-geocode.util';
import type { ResolvedVillagePin } from './village-location.util';

const ONEFIVENINE_GEOFENCE_M = 400;

const ONEFIVENINE_BASE = 'https://www.onefivenine.com';
const USER_AGENT = 'FlexHRM-VillageResolver/1.0 (Bihar school village lookup)';

export type OneFiveNineVillageHit = {
  path: string;
  label: string;
  districtSegment: string;
  blockSegment: string;
  villageSegment: string;
  villageId: string;
};

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugToTitle(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SCHOOL_TYPE_SUFFIX =
  /^(.*?)\s+(?:u\.?\s?h\.?\s?s\.?|u\.?\s?m\.?\s?s\.?|u\.?\s?p\.?\s?s\.?|n\.?\s?p\.?\s?s\.?|h\.?\s?s\.?|m\.?\s?s\.?|p\.?\s?s\.?|ups|ums|nps|ps|hs|ms)\s+(.+)$/i;

/**
 * Progressive village search strings from a school title.
 * Example: GIRL'S URDU P.S. MOULBITOLA → full name, URDU P.S. MOULBITOLA, P.S. MOULBITOLA, MOULBITOLA.
 */
export function villageSearchCombinationsFromSchoolName(schoolName: string): string[] {
  const trimmed = String(schoolName || '').trim();
  if (!trimmed) return [];

  const combos: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const v = String(value || '').trim();
    if (v.length < 4) return;
    const key = normalizeToken(v);
    if (!key || seen.has(key)) return;
    seen.add(key);
    combos.push(v);
  };

  push(trimmed);

  const villageHint = localityHintFromSchoolName(trimmed);
  if (villageHint) push(villageHint);

  const words = trimmed.split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length; i += 1) {
    push(words.slice(i).join(' '));
  }

  const typeMatch = trimmed.match(SCHOOL_TYPE_SUFFIX);
  if (typeMatch?.[2]) {
    push(typeMatch[2].trim());
    const afterTypeWords = typeMatch[2].trim().split(/\s+/).filter(Boolean);
    for (let i = 1; i < afterTypeWords.length; i += 1) {
      push(afterTypeWords.slice(i).join(' '));
    }
  }

  return combos.sort((a, b) => b.length - a.length);
}

function parseAutocompleteHtml(html: string): Array<{ path: string; label: string }> {
  const results: Array<{ path: string; label: string }> = [];
  const pattern = /<li onclick=fill\('([^']+)'\);>([^<]+)<\/li>/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match) {
    results.push({
      path: String(match[1] || '').trim(),
      label: String(match[2] || '').trim(),
    });
    match = pattern.exec(html);
  }
  return results;
}

function pathSegments(path: string): {
  districtSegment: string;
  blockSegment: string;
  villageSegment: string;
} {
  const parts = String(path || '')
    .split('/')
    .map((p) => slugToTitle(p))
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      districtSegment: parts[parts.length - 3] || '',
      blockSegment: parts[parts.length - 2] || '',
      villageSegment: parts[parts.length - 1] || '',
    };
  }
  if (parts.length === 2) {
    return {
      districtSegment: parts[0] || '',
      blockSegment: parts[0] || '',
      villageSegment: parts[1] || '',
    };
  }
  return {
    districtSegment: parts[0] || '',
    blockSegment: '',
    villageSegment: parts[0] || '',
  };
}

function scoreOneFiveNineHit(
  hit: { path: string; label: string; villageSegment: string; districtSegment: string; blockSegment: string },
  query: string,
  district: string,
  block: string,
): number {
  const queryNorm = normalizeToken(query);
  const villageNorm = normalizeToken(hit.villageSegment);
  const districtNorm = normalizeToken(district);
  const blockNorm = normalizeToken(block);
  const labelNorm = normalizeToken(hit.label);
  const pathNorm = normalizeToken(`${hit.path} ${hit.label}`);

  if (districtNorm && !tokenInHaystack(districtNorm, pathNorm) && !tokenInHaystack(districtNorm, labelNorm)) {
    return -1;
  }

  let score = 40;
  if (blockNorm && (tokenInHaystack(blockNorm, pathNorm) || tokenInHaystack(blockNorm, labelNorm))) {
    score += 25;
  } else if (blockNorm) {
    score -= 10;
  }

  if (villageNorm && queryNorm && (villageNorm === queryNorm || villageNorm.includes(queryNorm) || queryNorm.includes(villageNorm))) {
    score += 20;
  }

  if (villageNorm && tokenInHaystack(villageNorm, queryNorm)) score += 15;
  if (pathNorm.includes('bihar') || labelNorm.includes('bihar')) score += 5;

  return score;
}

export async function searchOneFiveNineVillages(
  query: string,
): Promise<Array<{ path: string; label: string; districtSegment: string; blockSegment: string; villageSegment: string }>> {
  const q = String(query || '').trim();
  if (q.length < 4) return [];

  try {
    const res = await fetch(`${ONEFIVENINE_BASE}/autoComplete.dont?method=completeVillages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      },
      body: new URLSearchParams({ queryString: q }).toString(),
    });
    if (!res.ok) return [];

    const html = await res.text();
    return parseAutocompleteHtml(html).map((row) => ({
      ...row,
      ...pathSegments(row.path),
    }));
  } catch {
    return [];
  }
}

function slugForOneFiveNinePath(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildDirectOneFiveNinePaths(
  district: string,
  block: string,
  villageCombo: string,
): string[] {
  const d = slugForOneFiveNinePath(district);
  const b = slugForOneFiveNinePath(block);
  const v = slugForOneFiveNinePath(villageCombo);
  const compact = slugForOneFiveNinePath(villageCombo.replace(/\s+/g, ''));
  const paths = [
    d && b && v ? `${d}/${b}/${v}` : '',
    d && b && compact && compact !== v ? `${d}/${b}/${compact}` : '',
  ].filter(Boolean);
  return [...new Set(paths)];
}

export async function tryOneFiveNineDirectPath(
  district: string,
  block: string,
  villageCombo: string,
): Promise<ResolvedVillagePin | null> {
  const combo = String(villageCombo || '').trim();
  if (combo.length < 4) return null;

  for (const path of buildDirectOneFiveNinePaths(district, block, combo)) {
    const villageId = await fetchVillageIdFromPath(path);
    if (!villageId) continue;

    const coords = await fetchOneFiveNineCoords(villageId);
    if (!coords) continue;

    const segments = pathSegments(path);
    const pin = pinFromOneFiveNine(
      {
        path,
        label: combo,
        ...segments,
        villageId,
      },
      coords,
      `onefivenine-direct:${path}`,
      combo,
      block,
      district,
    );
    if (pin) {
      return { ...pin, resolutionStep: 'onefivenine_direct' };
    }
  }

  return null;
}

async function fetchVillageIdFromPath(path: string): Promise<string> {
  const slugPath = String(path || '').trim();
  if (!slugPath) return '';

  try {
    const res = await fetch(`${ONEFIVENINE_BASE}/india/villages/${slugPath}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match =
      /name="villageId"\s+value="(\d+)"/i.exec(html) ||
      /villageId=(\d{5,})/i.exec(html);
    return match?.[1] ? String(match[1]) : '';
  } catch {
    return '';
  }
}

async function fetchOneFiveNineCoords(villageId: string): Promise<{ lat: number; lng: number } | null> {
  const id = String(villageId || '').trim();
  if (!id) return null;

  try {
    const res = await fetch(`${ONEFIVENINE_BASE}/map.dont?method=loadEditMap&villageId=${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const hiddenLat = /name="lat"\s+value="([\d.-]+)"/i.exec(html)?.[1];
    const hiddenLng = /name="lang"\s+value="([\d.-]+)"/i.exec(html)?.[1];
    if (hiddenLat && hiddenLng) {
      const lat = Number(hiddenLat);
      const lng = Number(hiddenLng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        return { lat, lng };
      }
    }

    const latAssignments = [...html.matchAll(/inputLat=([\d.-]+)/gi)].map((m) => Number(m[1]));
    const lngAssignments = [...html.matchAll(/inputLang=([\d.-]+)/gi)].map((m) => Number(m[1]));
    for (let i = latAssignments.length - 1; i >= 0; i -= 1) {
      const lat = latAssignments[i];
      const lng = lngAssignments[i];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat === -34.397 && lng === 150.644) continue;
      if (lat === 0 && lng === 0) continue;
      return { lat, lng };
    }

    return null;
  } catch {
    return null;
  }
}

function pinFromOneFiveNine(
  hit: OneFiveNineVillageHit,
  coords: { lat: number; lng: number },
  queryUsed: string,
  villageLabel: string,
  block: string,
  district: string,
): ResolvedVillagePin | null {
  if (!coordinatesInBihar(coords.lat, coords.lng)) return null;

  const formattedAddress = [
    hit.villageSegment || villageLabel,
    hit.blockSegment || block,
    hit.districtSegment || district,
    'Bihar',
    'India',
  ]
    .filter(Boolean)
    .join(', ');

  if (!placeInExpectedAdminArea(formattedAddress, district, block)) return null;
  if (!villageNameInResult(villageLabel, hit.villageSegment, formattedAddress)) return null;

  return {
    lat: coords.lat,
    lng: coords.lng,
    placeName: hit.villageSegment || villageLabel,
    formattedAddress,
    googleMapsUrl: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`,
    locationSource: 'onefivenine',
    locationConfidence: 'village',
    geofenceRadiusM: ONEFIVENINE_GEOFENCE_M,
    queryUsed,
    matchScore: 70,
    resolutionStep: 'onefivenine_village',
  };
}

export async function resolveOneFiveNineVillagePin(
  schoolName: string,
  block: string,
  district: string,
): Promise<{ pin: ResolvedVillagePin | null; villageHint: string; queryUsed: string }> {
  const combos = villageSearchCombinationsFromSchoolName(schoolName);
  const villageHint = localityHintFromSchoolName(schoolName) || combos[combos.length - 1] || '';

  for (const query of combos) {
    const hits = await searchOneFiveNineVillages(query);
    const ranked = hits
      .map((hit) => ({ hit, score: scoreOneFiveNineHit(hit, query, district, block) }))
      .filter((row) => row.score >= 45)
      .sort((a, b) => b.score - a.score);

    for (const { hit } of ranked.slice(0, 5)) {
      const villageId = await fetchVillageIdFromPath(hit.path);
      if (!villageId) continue;

      const coords = await fetchOneFiveNineCoords(villageId);
      if (!coords) continue;

      const pin = pinFromOneFiveNine(
        { ...hit, villageId },
        coords,
        `onefivenine:${query}→${hit.path}`,
        query,
        block,
        district,
      );
      if (pin) {
        return { pin, villageHint, queryUsed: pin.queryUsed };
      }
    }

    await new Promise((r) => setTimeout(r, 350));
  }

  return { pin: null, villageHint, queryUsed: '' };
}
