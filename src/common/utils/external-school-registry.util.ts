import { coordinatesInBihar } from './bihar-geography.util';
import type { ResolvedSchoolPlace } from './google-school-place.util';
import {
  SCHOOL_GEOFENCE_EXACT_M,
} from './google-school-place.util';

const DRAMITKUMAR_BASE = 'https://schoolinfo.dramitkumar.in';
const SCHOOLS_ORG_IN_BASE = 'https://schools.org.in';
const FETCH_TIMEOUT_MS = 12_000;

export type ExternalSchoolRegistrySource = 'dramitkumar' | 'schools_org_in';

export type ExternalSchoolRecord = {
  udise: string;
  schoolName: string;
  lat: number;
  lng: number;
  village: string;
  panchayat: string;
  cluster: string;
  source: ExternalSchoolRegistrySource;
};

type DramitKumarApiRow = {
  dise_code?: string | number;
  school_name?: string;
  latitude?: string | number;
  longitude?: string | number;
  village?: string;
  panchayat?: string;
  cluster?: string;
};

const dramitBlockCaches = new Map<string, Map<string, ExternalSchoolRecord>>();

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseDistrictOrBlock(value: string): string {
  const token = normalizeToken(value);
  const known: Record<string, string> = {
    purnia: 'Purnia',
    madhepura: 'Madhepura',
    amour: 'Amour',
    banmankhi: 'Banmankhi',
    alamnagar: 'Alamnagar',
  };
  if (known[token]) return known[token];
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function districtSlug(value: string): string {
  return normalizeToken(value).replace(/\s+/g, '-');
}

function blockCacheKey(district: string, block: string): string {
  return `${titleCaseDistrictOrBlock(district)}|${titleCaseDistrictOrBlock(block)}`;
}

function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function parseCoordinate(value: string | number | undefined): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
}

function normalizeUdise(value: string | number | undefined): string {
  return String(value || '').replace(/\D/g, '').trim();
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'application/json,text/html,*/*',
        'User-Agent': 'FlexHRM/1.0 (school location resolver)',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function recordFromDramitRow(row: DramitKumarApiRow): ExternalSchoolRecord | null {
  const udise = normalizeUdise(row.dise_code);
  const lat = parseCoordinate(row.latitude);
  const lng = parseCoordinate(row.longitude);
  if (udise.length !== 11 || lat == null || lng == null) return null;
  if (!coordinatesInBihar(lat, lng)) return null;
  return {
    udise,
    schoolName: String(row.school_name || '').trim(),
    lat,
    lng,
    village: String(row.village || '').trim(),
    panchayat: String(row.panchayat || '').trim(),
    cluster: String(row.cluster || '').trim(),
    source: 'dramitkumar',
  };
}

/** Cached block index from schoolinfo.dramitkumar.in (UDISE → coords + village). */
export async function getDramitKumarBlockIndex(
  district: string,
  block: string,
): Promise<Map<string, ExternalSchoolRecord>> {
  const key = blockCacheKey(district, block);
  const existing = dramitBlockCaches.get(key);
  if (existing) return existing;

  const params = new URLSearchParams({
    district: titleCaseDistrictOrBlock(district),
    block: titleCaseDistrictOrBlock(block),
  });
  const text = await fetchText(`${DRAMITKUMAR_BASE}/get-school-map-data?${params.toString()}`);
  const index = new Map<string, ExternalSchoolRecord>();
  if (!text) {
    dramitBlockCaches.set(key, index);
    return index;
  }

  try {
    const rows = JSON.parse(text) as DramitKumarApiRow[];
    if (!Array.isArray(rows)) {
      dramitBlockCaches.set(key, index);
      return index;
    }
    for (const row of rows) {
      const record = recordFromDramitRow(row);
      if (record) index.set(record.udise, record);
    }
  } catch {
    // ignore malformed JSON
  }

  dramitBlockCaches.set(key, index);
  return index;
}

function parseSchoolsOrgInHtml(html: string, udise: string): ExternalSchoolRecord | null {
  const latMatch = html.match(/\blat:\s*([0-9.-]+)/i);
  const lngMatch = html.match(/\blng:\s*([0-9.-]+)/i);
  const lat = parseCoordinate(latMatch?.[1]);
  const lng = parseCoordinate(lngMatch?.[1]);
  if (lat == null || lng == null || !coordinatesInBihar(lat, lng)) return null;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = String(titleMatch?.[1] || '')
    .replace(/\s+/g, ' ')
    .trim();
  const schoolName = title.split(' - ')[0]?.trim() || '';

  const villageMatch = html.match(/Village\s*\/\s*Town:\s*<b>([^<]+)<\/b>/i);
  const village = String(villageMatch?.[1] || '').trim();

  return {
    udise,
    schoolName,
    lat,
    lng,
    village,
    panchayat: '',
    cluster: '',
    source: 'schools_org_in',
  };
}

async function lookupSchoolsOrgInByUdise(
  udise: string,
  district: string,
): Promise<ExternalSchoolRecord | null> {
  const slug = districtSlug(district);
  if (!slug) return null;
  const url = `${SCHOOLS_ORG_IN_BASE}/${slug}/${udise}/`;
  const html = await fetchText(url);
  if (!html || /error 404|page not found/i.test(html)) return null;
  return parseSchoolsOrgInHtml(html, udise);
}

export async function lookupExternalSchoolRegistry(params: {
  udise?: string;
  district?: string;
  block?: string;
}): Promise<ExternalSchoolRecord | null> {
  const udise = normalizeUdise(params.udise);
  const district = String(params.district || '').trim();
  const block = String(params.block || '').trim();
  if (udise.length !== 11) return null;

  if (district && block) {
    const index = await getDramitKumarBlockIndex(district, block);
    const dramitHit = index.get(udise);
    if (dramitHit) return dramitHit;
  }

  if (district) {
    const orgHit = await lookupSchoolsOrgInByUdise(udise, district);
    if (orgHit) return orgHit;
  }

  return null;
}

export function externalRecordToResolvedPlace(
  record: ExternalSchoolRecord,
  block: string,
  district: string,
): ResolvedSchoolPlace {
  const placeName = record.schoolName || `UDISE ${record.udise}`;
  const addressParts = [
    record.village,
    record.panchayat,
    record.cluster,
    block,
    district,
    'Bihar',
    'India',
  ].filter(Boolean);
  const formattedAddress = addressParts.join(', ');
  const isDramit = record.source === 'dramitkumar';

  return {
    lat: record.lat,
    lng: record.lng,
    placeName,
    formattedAddress,
    googlePlaceId: '',
    googleMapsUrl: buildGoogleMapsUrl(record.lat, record.lng),
    locationSource: record.source,
    locationConfidence: 'exact',
    geofenceRadiusM: SCHOOL_GEOFENCE_EXACT_M,
    queryUsed: isDramit
      ? `dramitkumar:${district}/${block}/${record.udise}`
      : `schools.org.in:${districtSlug(district)}/${record.udise}`,
    matchScore: isDramit ? 96 : 92,
    resolutionStep: isDramit ? 'dramitkumar_registry' : 'schools_org_in_registry',
  };
}

/** Clear cached dramitkumar block indexes (useful in tests). */
export function clearExternalSchoolRegistryCaches(): void {
  dramitBlockCaches.clear();
}
