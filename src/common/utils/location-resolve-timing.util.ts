/**
 * Central timeouts for school/village location resolve.
 * Keep fetch timeouts below per-school budget so Promise.race can fall through cleanly.
 */
export const RESOLVE_TIMING = {
  /** dramitkumar / schools.org.in HTTP fetch */
  registryFetchMs: 10_000,
  /** Google Places / Geocode per call */
  googleApiMs: 8_000,
  /** onefivenine in bulk fast mode (2 fetches: page + coords) */
  oneFiveNineFastMs: 7_000,
  /** onefivenine in thorough mode */
  oneFiveNineFullMs: 11_000,
  /** OSM Nominatim forward search */
  osmFetchMs: 7_000,
  /** Block gate Google reverse geocode */
  blockGateGoogleMs: 8_000,
  /** Per-school resolve budget — bulk fast (Hostinger) */
  schoolBudgetFastMs: 22_000,
  /** Per-school resolve budget — thorough / single-school */
  schoolBudgetFullMs: 32_000,
  /** Gap between schools inside one bulk HTTP request */
  interSchoolDelayMs: 250,
  /** Max schools processed per bulk HTTP request (shared block cache) */
  bulkSchoolsPerRequest: 4,
} as const;

export function schoolResolveBudgetMs(fastMode: boolean): number {
  return fastMode ? RESOLVE_TIMING.schoolBudgetFastMs : RESOLVE_TIMING.schoolBudgetFullMs;
}

export function oneFiveNineFetchTimeoutMs(fastMode: boolean): number {
  return fastMode ? RESOLVE_TIMING.oneFiveNineFastMs : RESOLVE_TIMING.oneFiveNineFullMs;
}

export function googleFetchTimeoutMs(): number {
  return RESOLVE_TIMING.googleApiMs;
}

export function registryFetchTimeoutMs(): number {
  return RESOLVE_TIMING.registryFetchMs;
}

export function osmFetchTimeoutMs(): number {
  return RESOLVE_TIMING.osmFetchMs;
}

export function blockGateFetchTimeoutMs(): number {
  return RESOLVE_TIMING.blockGateGoogleMs;
}
