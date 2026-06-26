import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (!this.isConfigured()) {
      this.logger.warn('SMTP not configured — password reset codes will only be shown in the API response');
      return;
    }

    this.transporter = this.createTransporter();
    void this.transporter.verify().then(
      () => this.logger.log(`SMTP ready (${this.configService.get<string>('smtpHost')})`),
      (err: Error) =>
        this.logger.error(`SMTP verification failed: ${err.message}`, err.stack),
    );
  }

  isConfigured(): boolean {
    const host = this.configService.get<string>('smtpHost');
    const user = this.configService.get<string>('smtpUser');
    const pass = this.configService.get<string>('smtpPass');
    return !!(host && user && pass);
  }

  private createTransporter(): Transporter {
    const service = this.configService.get<string>('smtpService');
    const auth = {
      user: this.configService.get<string>('smtpUser'),
      pass: this.configService.get<string>('smtpPass'),
    };

    if (service) {
      return nodemailer.createTransport({ service, auth });
    }

    const port = this.configService.get<number>('smtpPort') ?? 587;
    const secure = this.configService.get<boolean>('smtpSecure') ?? false;

    return nodemailer.createTransport({
      host: this.configService.get<string>('smtpHost'),
      port,
      secure,
      auth,
      ...(port === 587 && !secure ? { requireTLS: true } : {}),
    });
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = this.createTransporter();
    }
    return this.transporter;
  }

  async sendPasswordResetCode(to: string, username: string, resetCode: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const from =
      this.configService.get<string>('smtpFrom') ||
      this.configService.get<string>('smtpUser') ||
      this.configService.get<string>('companyEmail') ||
      'noreply@flexhrm.local';

    try {
      await this.getTransporter().sendMail({
        from,
        to,
        subject: 'Flex HRM — Password Reset Code',
        text:
          `Hello ${username},\n\n` +
          `Your password reset code is: ${resetCode}\n\n` +
          `This code expires in 15 minutes. If you did not request this, you can ignore this email.\n\n` +
          `— Flex HRM`,
        html:
          `<p>Hello <strong>${username}</strong>,</p>` +
          `<p>Your password reset code is:</p>` +
          `<p style="font-size:24px;font-weight:bold;letter-spacing:4px;font-family:monospace;">${resetCode}</p>` +
          `<p>This code expires in <strong>15 minutes</strong>. If you did not request this, you can ignore this email.</p>` +
          `<p>— Flex HRM</p>`,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send password reset email to ${to}: ${message}`);
      return false;
    }
  }
}
