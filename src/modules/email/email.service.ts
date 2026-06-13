import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('smtpHost');
  }

  async sendPasswordResetCode(to: string, username: string, resetCode: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const from =
      this.configService.get<string>('smtpFrom') ||
      this.configService.get<string>('companyEmail') ||
      'noreply@flexhrm.local';

    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>('smtpHost'),
      port: this.configService.get<number>('smtpPort') ?? 587,
      secure: this.configService.get<boolean>('smtpSecure') ?? false,
      auth: {
        user: this.configService.get<string>('smtpUser'),
        pass: this.configService.get<string>('smtpPass'),
      },
    });

    try {
      await transporter.sendMail({
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
      this.logger.error(`Failed to send password reset email to ${to}`, err);
      return false;
    }
  }
}
