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

export interface SupervisorAccessProfile {
  id: string;
  assignedBlocks: string[];
}

export function countSupervisorsForBlock(
  blockName: string,
  supervisors: SupervisorAccessProfile[],
): number {
  const schoolBlock = normalizeBlockKey(blockName);
  if (!schoolBlock) return 0;

  let count = 0;
  for (const supervisor of supervisors) {
    const covers = (supervisor.assignedBlocks || []).some(
      (block) => normalizeBlockKey(block) === schoolBlock,
    );
    if (covers) count++;
  }
  return count;
}

export function countSupervisorsForSchool(
  school: Record<string, unknown>,
  supervisors: SupervisorAccessProfile[],
): number {
  let count = 0;
  for (const supervisor of supervisors) {
    if (
      supervisorCanAccessSchool(
        school,
        supervisor.id,
        supervisor.assignedBlocks,
      )
    ) {
      count++;
    }
  }
  return count;
}

export function isSchoolSharedVisitCooldown(
  school: Record<string, unknown>,
  supervisors: SupervisorAccessProfile[],
): boolean {
  const block = String(school.block || '');
  if (countSupervisorsForBlock(block, supervisors) > 1) return true;
  return countSupervisorsForSchool(school, supervisors) > 1;
}
