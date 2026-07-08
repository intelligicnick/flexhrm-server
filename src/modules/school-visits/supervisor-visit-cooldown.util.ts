import { BadRequestException } from '@nestjs/common';

export const MIN_DAYS_BETWEEN_SCHOOL_VISITS = 5;

export function daysBetweenIsoDates(
  lastVisitDate: string,
  nextVisitDate: string,
): number {
  const last = new Date(`${lastVisitDate}T12:00:00`);
  const next = new Date(`${nextVisitDate}T12:00:00`);
  return Math.floor((next.getTime() - last.getTime()) / 86_400_000);
}

export function daysUntilVisitAllowed(lastVisitDate: string, fromDate: string): number {
  return Math.max(
    0,
    MIN_DAYS_BETWEEN_SCHOOL_VISITS - daysBetweenIsoDates(lastVisitDate, fromDate),
  );
}

export function isVisitCooldownActive(
  lastVisitDate: string | null | undefined,
  nextVisitDate: string,
): boolean {
  if (!lastVisitDate) return false;
  return daysBetweenIsoDates(lastVisitDate, nextVisitDate) < MIN_DAYS_BETWEEN_SCHOOL_VISITS;
}

export function assertVisitCooldownAllowed(
  lastVisitDate: string | null | undefined,
  nextVisitDate: string,
  actionLabel: 'visit' | 'schedule' = 'visit',
): void {
  if (!lastVisitDate) return;
  const daysSince = daysBetweenIsoDates(lastVisitDate, nextVisitDate);
  if (daysSince >= MIN_DAYS_BETWEEN_SCHOOL_VISITS) return;

  const daysLeft = MIN_DAYS_BETWEEN_SCHOOL_VISITS - daysSince;
  const verb = actionLabel === 'schedule' ? 'scheduling' : 'visiting';
  throw new BadRequestException(
    `Please wait ${daysLeft} more day(s) before ${verb} this school again.`,
  );
}
