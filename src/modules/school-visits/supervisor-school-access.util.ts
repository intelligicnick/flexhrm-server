export function normalizeBlockKey(block: string): string {
  return String(block || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function supervisorCanAccessSchool(
  school: Record<string, unknown>,
  supervisorId: string,
  assignedBlocks: string[],
): boolean {
  const sid = String(supervisorId || '').trim();
  if (sid && String(school.assignedSupervisorId || '').trim() === sid) {
    return true;
  }

  const schoolBlock = normalizeBlockKey(String(school.block || ''));
  if (!schoolBlock) return false;

  const blocks = (assignedBlocks || [])
    .map((block) => normalizeBlockKey(block))
    .filter(Boolean);
  if (blocks.length === 0) return false;

  return blocks.includes(schoolBlock);
}

export function filterSchoolsForSupervisor(
  schools: Record<string, unknown>[],
  supervisorId: string,
  assignedBlocks: string[],
): Record<string, unknown>[] {
  return schools.filter((school) =>
    supervisorCanAccessSchool(school, supervisorId, assignedBlocks),
  );
}
