import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../schemas/tenant.schema';
import { DEFAULT_TENANT_ID } from './platform.constants';

@Injectable()
export class TenantContextService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
  ) {}

  async resolveTenantId(params: {
    host?: string;
    subdomainHeader?: string;
    tenantIdHeader?: string;
  }): Promise<string> {
    if (params.tenantIdHeader?.trim()) {
      const tenant = await this.tenantModel
        .findOne({ id: params.tenantIdHeader.trim(), status: { $ne: 'cancelled' } })
        .select('id')
        .lean();
      if (tenant) return tenant.id;
    }

    const subdomain = this.extractSubdomain(params.host, params.subdomainHeader);
    if (subdomain) {
      const tenant = await this.tenantModel
        .findOne({ subdomain, status: { $ne: 'cancelled' } })
        .select('id')
        .lean();
      if (tenant) return tenant.id;
    }

    return DEFAULT_TENANT_ID;
  }

  async getTenantById(tenantId: string): Promise<TenantDocument | null> {
    return this.tenantModel.findOne({ id: tenantId }).exec();
  }

  async isTenantActive(tenantId: string): Promise<boolean> {
    if (tenantId === DEFAULT_TENANT_ID) return true;
    const tenant = await this.tenantModel
      .findOne({ id: tenantId })
      .select('status trialEndsAt')
      .lean();
    if (!tenant) return false;
    if (tenant.status === 'active') return true;
    if (tenant.status === 'trial' && tenant.trialEndsAt && tenant.trialEndsAt > new Date()) {
      return true;
    }
    return false;
  }

  private extractSubdomain(host?: string, subdomainHeader?: string): string | null {
    if (subdomainHeader?.trim()) return subdomainHeader.trim().toLowerCase();

    if (!host) return null;
    const hostname = host.split(':')[0].toLowerCase();

    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return null;
    }

    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'app') {
      return parts[0];
    }

    return null;
  }
}

export function withTenantFilter(
  tenantId: string,
  query: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...query, tenantId };
}
