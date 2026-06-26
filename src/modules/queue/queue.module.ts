import { Global, Module, OnModuleInit } from '@nestjs/common';
import { QueueService } from './queue.service';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';

@Global()
@Module({
  imports: [EmailModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule implements OnModuleInit {
  constructor(
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    this.queueService.registerHandler('send_email', async (data) => {
      await this.emailService.sendNotificationEmail(
        String(data.to ?? ''),
        String(data.subject ?? ''),
        String(data.text ?? ''),
      );
    });

    this.queueService.registerHandler('trial_reminder', async (data) => {
      await this.emailService.sendTrialReminder(
        String(data.to ?? ''),
        String(data.companyName ?? ''),
        Number(data.daysLeft ?? 3),
      );
    });
  }
}
