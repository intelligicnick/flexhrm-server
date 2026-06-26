import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';

export function resolveTenantId(tenantId?: string): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

export function withTenantId(
  tenantId: string | undefined,
  query: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...query, tenantId: resolveTenantId(tenantId) };
}

export function assertTenantMatch(
  sessionTenantId: string | undefined,
  requestTenantId: string | undefined,
): void {
  const session = resolveTenantId(sessionTenantId);
  const request = resolveTenantId(requestTenantId);
  if (session !== request) {
    throw new Error('TENANT_MISMATCH');
  }
}

export function tenantCompoundIndex(
  fields: Record<string, 1 | -1>,
): Array<{ fields: Record<string, 1 | -1>; options: { unique?: boolean } }> {
  return [{ fields: { tenantId: 1, ...fields }, options: { unique: true } }];
}
