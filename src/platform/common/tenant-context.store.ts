import { AsyncLocalStorage } from 'async_hooks';
import { DEFAULT_TENANT_ID } from './platform.constants';

interface TenantContextStore {
  tenantId: string;
  bypassScope: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantContextStore>();

export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

export function isTenantScopeBypassed(): boolean {
  return tenantStorage.getStore()?.bypassScope === true;
}

/** Run async work within a tenant scope (used by middleware and background jobs). */
export function runWithTenantScope<T>(tenantId: string, fn: () => T): T {
  const resolved = tenantId?.trim() || DEFAULT_TENANT_ID;
  return tenantStorage.run({ tenantId: resolved, bypassScope: false }, fn);
}

/** Run migrations, platform seeds, or cross-tenant admin queries without auto-scoping. */
export function runWithoutTenantScope<T>(fn: () => T): T {
  const current = tenantStorage.getStore();
  if (current) {
    return tenantStorage.run({ ...current, bypassScope: true }, fn);
  }
  return tenantStorage.run({ tenantId: DEFAULT_TENANT_ID, bypassScope: true }, fn);
}
