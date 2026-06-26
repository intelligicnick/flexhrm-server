import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HelpdeskTicket,
  HelpdeskTicketDocument,
  KnowledgeBaseArticle,
  KnowledgeBaseArticleDocument,
} from '../../database/schemas/helpdesk.schema';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class HelpdeskService {
  constructor(
    @InjectModel(HelpdeskTicket.name) private readonly ticketModel: Model<HelpdeskTicketDocument>,
    @InjectModel(KnowledgeBaseArticle.name)
    private readonly articleModel: Model<KnowledgeBaseArticleDocument>,
  ) {}

  async findTickets(tenantId?: string): Promise<HelpdeskTicket[]> {
    return this.ticketModel.find(withTenantId(tenantId)).sort({ createdAt: -1 }).lean().exec();
  }

  async createTicket(
    tenantId: string | undefined,
    data: Partial<HelpdeskTicket>,
  ): Promise<HelpdeskTicket> {
    const doc = await this.ticketModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `tkt_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }

  async updateTicketStatus(
    tenantId: string | undefined,
    id: string,
    status: string,
  ): Promise<HelpdeskTicket> {
    const update: Record<string, unknown> = { status };
    if (status === 'resolved' || status === 'closed') update.resolvedAt = new Date();
    const doc = await this.ticketModel
      .findOneAndUpdate(withTenantId(tenantId, { id }), { $set: update }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Ticket not found');
    return doc as HelpdeskTicket;
  }

  async findArticles(tenantId?: string): Promise<KnowledgeBaseArticle[]> {
    return this.articleModel
      .find(withTenantId(tenantId, { published: true }))
      .sort({ title: 1 })
      .lean()
      .exec();
  }

  async createArticle(
    tenantId: string | undefined,
    data: Partial<KnowledgeBaseArticle>,
  ): Promise<KnowledgeBaseArticle> {
    const doc = await this.articleModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `kb_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }
}
