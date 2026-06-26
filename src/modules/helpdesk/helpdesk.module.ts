import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HelpdeskTicket,
  HelpdeskTicketSchema,
  KnowledgeBaseArticle,
  KnowledgeBaseArticleSchema,
} from '../../database/schemas/helpdesk.schema';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskService } from './helpdesk.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HelpdeskTicket.name, schema: HelpdeskTicketSchema },
      { name: KnowledgeBaseArticle.name, schema: KnowledgeBaseArticleSchema },
    ]),
  ],
  controllers: [HelpdeskController],
  providers: [HelpdeskService],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
