export function resolveContractIdForLocation(
  location: string,
  contracts: Array<{ id: string; linkedLocations?: string[] }>,
): string {
  const key = location.trim().toLowerCase();
  if (!key) return '';

  const matches = contracts.filter((contract) =>
    (contract.linkedLocations || []).some(
      (loc) => loc.trim().toLowerCase() === key,
    ),
  );

  return matches.length === 1 ? matches[0].id : '';
}
