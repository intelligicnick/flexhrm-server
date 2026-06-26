import { Schema } from 'mongoose';
import { DEFAULT_TENANT_ID } from '../platform/common/platform.constants';
import { applyTenantQueryScope } from './tenant-query.plugin';

/** Ensures every collection has tenantId field and auto-scoped queries. */
export function ensureTenantScope(schema: Schema): void {
  if (!schema.path('tenantId')) {
    schema.add({
      tenantId: { type: String, default: DEFAULT_TENANT_ID, index: true },
    });
  }
  applyTenantQueryScope(schema);
}
