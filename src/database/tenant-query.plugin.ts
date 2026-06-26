import { Schema, Query } from 'mongoose';
import {
  getCurrentTenantId,
  isTenantScopeBypassed,
} from '../platform/common/tenant-context.store';

const SCOPED_QUERY_OPS = [
  'count',
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const;

function applyTenantFilter(this: Query<unknown, unknown>): void {
  if (isTenantScopeBypassed()) return;

  const tenantId = getCurrentTenantId();
  if (!tenantId) return;

  const filter = this.getFilter();
  if (Object.prototype.hasOwnProperty.call(filter, 'tenantId')) return;
  // Custom tenant matching (e.g. legacy default-tenant $or) must not be double-filtered.
  if (Object.prototype.hasOwnProperty.call(filter, '$or')) return;

  this.where({ tenantId });
}

function stampTenantOnDocument(doc: Record<string, unknown>): void {
  if (isTenantScopeBypassed()) return;

  const tenantId = getCurrentTenantId();
  if (!tenantId) return;

  if (doc.tenantId === undefined || doc.tenantId === null || doc.tenantId === '') {
    doc.tenantId = tenantId;
  }
}

/** Automatically scopes all Mongoose queries to the current request tenant. */
export function applyTenantQueryScope(schema: Schema): void {
  for (const op of SCOPED_QUERY_OPS) {
    schema.pre(op as Parameters<Schema['pre']>[0], applyTenantFilter);
  }

  schema.pre('save', function saveTenantScope(next) {
    if (!isTenantScopeBypassed()) {
      const tenantId = getCurrentTenantId();
      if (tenantId && !this.get('tenantId')) {
        this.set('tenantId', tenantId);
      }
    }
    next();
  });

  schema.pre('insertMany', function insertManyTenantScope(next, docs: unknown) {
    if (!Array.isArray(docs)) {
      next();
      return;
    }
    for (const doc of docs) {
      if (doc && typeof doc === 'object') {
        stampTenantOnDocument(doc as Record<string, unknown>);
      }
    }
    next();
  });
}
