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
    const service = this.configService.get<string>('smtpService');
    const host = this.configService.get<string>('smtpHost');
    const user = this.configService.get<string>('smtpUser');
    const pass = this.configService.get<string>('smtpPass');
    return !!((service || host) && user && pass);
  }

  private createTransporter(): Transporter {
    const service = this.configService.get<string>('smtpService');
    const auth = {
      user: this.configService.get<string>('smtpUser'),
      pass: this.configService.get<string>('smtpPass'),
    };

    const sandbox = {
      disableFileAccess: true,
      disableUrlAccess: true,
    };

    if (service) {
      return nodemailer.createTransport({ service, auth, ...sandbox });
    }

    const port = this.configService.get<number>('smtpPort') ?? 587;
    const secure = this.configService.get<boolean>('smtpSecure') ?? false;

    return nodemailer.createTransport({
      host: this.configService.get<string>('smtpHost'),
      port,
      secure,
      auth,
      ...sandbox,
      ...(port === 587 && !secure ? { requireTLS: true } : {}),
    });
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = this.createTransporter();
    }
    return this.transporter;
  }

  private async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const from =
      this.configService.get<string>('smtpFrom') ||
      this.configService.get<string>('smtpUser') ||
      this.configService.get<string>('companyEmail') ||
      'noreply@flexhrm.local';

    try {
      await this.getTransporter().sendMail({ from, ...options });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${options.to}: ${message}`);
      return false;
    }
  }

  async sendPasswordResetCode(to: string, username: string, resetCode: string): Promise<boolean> {
    return this.sendMail({
      to,
      subject: 'Flex HRM — Password Reset Code',
      text:
        `Hello ${username},\n\nYour password reset code is: ${resetCode}\n\n` +
        `This code expires in 15 minutes.\n\n— Flex HRM`,
      html:
        `<p>Hello <strong>${username}</strong>,</p>` +
        `<p>Your password reset code is:</p>` +
        `<p style="font-size:24px;font-weight:bold;letter-spacing:4px;font-family:monospace;">${resetCode}</p>` +
        `<p>This code expires in <strong>15 minutes</strong>.</p><p>— Flex HRM</p>`,
    });
  }

  async sendWelcomeEmail(to: string, companyName: string, adminUsername: string, trialDays: number): Promise<boolean> {
    return this.sendMail({
      to,
      subject: `Welcome to Flex HRM — ${companyName}`,
      text:
        `Welcome to Flex HRM!\n\nYour company "${companyName}" is ready.\n` +
        `Admin username: ${adminUsername}\nTrial period: ${trialDays} days\n\n— Flex HRM`,
      html:
        `<h2>Welcome to Flex HRM!</h2>` +
        `<p>Your company <strong>${companyName}</strong> is ready to use.</p>` +
        `<p>Admin username: <strong>${adminUsername}</strong><br/>Trial: <strong>${trialDays} days</strong></p>` +
        `<p><a href="/hrmlogin">Sign in to your dashboard</a></p><p>— Flex HRM</p>`,
    });
  }

  async sendTrialReminder(to: string, companyName: string, daysLeft: number): Promise<boolean> {
    return this.sendMail({
      to,
      subject: `Flex HRM trial ending in ${daysLeft} day(s) — ${companyName}`,
      text:
        `Your Flex HRM trial for "${companyName}" ends in ${daysLeft} day(s).\n` +
        `Upgrade now to keep your data and continue using all features.\n\n— Flex HRM`,
      html:
        `<p>Your Flex HRM trial for <strong>${companyName}</strong> ends in <strong>${daysLeft} day(s)</strong>.</p>` +
        `<p><a href="/register">Upgrade your plan</a> to continue without interruption.</p><p>— Flex HRM</p>`,
    });
  }

  async sendNotificationEmail(to: string, subject: string, text: string): Promise<boolean> {
    return this.sendMail({
      to,
      subject,
      text,
      html: `<p>${text.replace(/\n/g, '<br/>')}</p><p>— Flex HRM</p>`,
    });
  }
}
