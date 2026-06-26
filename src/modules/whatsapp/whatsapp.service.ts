import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WhatsAppProvider = 'meta' | 'twilio' | 'disabled';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: WhatsAppProvider;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.provider = (this.config.get<string>('WHATSAPP_PROVIDER') ?? 'disabled') as WhatsAppProvider;
    this.enabled =
      this.provider !== 'disabled' &&
      !!(this.config.get('WHATSAPP_API_TOKEN') || this.config.get('TWILIO_ACCOUNT_SID'));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendMessage(phone: string, message: string): Promise<{ sent: boolean; provider: string }> {
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) {
      this.logger.warn('WhatsApp: empty phone number');
      return { sent: false, provider: this.provider };
    }

    if (!this.enabled) {
      this.logger.log(`[WhatsApp stub] To +${normalized}: ${message.slice(0, 80)}...`);
      return { sent: false, provider: 'disabled' };
    }

    try {
      if (this.provider === 'meta') {
        return await this.sendViaMeta(normalized, message);
      }
      if (this.provider === 'twilio') {
        return await this.sendViaTwilio(normalized, message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp send failed: ${msg}`);
    }

    return { sent: false, provider: this.provider };
  }

  async sendOtp(phone: string, otp: string): Promise<{ sent: boolean }> {
    return this.sendMessage(phone, `Your FlexHRM verification code is: ${otp}. Valid for 10 minutes.`);
  }

  async sendAttendanceAlert(
    phone: string,
    employeeName: string,
    punchType: 'in' | 'out',
    time: string,
  ): Promise<{ sent: boolean }> {
    const action = punchType === 'in' ? 'checked in' : 'checked out';
    return this.sendMessage(
      phone,
      `FlexHRM: ${employeeName} has ${action} at ${time}.`,
    );
  }

  async sendTrialReminder(phone: string, companyName: string, daysLeft: number): Promise<{ sent: boolean }> {
    return this.sendMessage(
      phone,
      `FlexHRM: Hi ${companyName}, your trial expires in ${daysLeft} day(s). Upgrade at your dashboard to keep access.`,
    );
  }

  private async sendViaMeta(
    phone: string,
    message: string,
  ): Promise<{ sent: boolean; provider: string }> {
    const token = this.config.get<string>('WHATSAPP_API_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneNumberId) {
      this.logger.warn('Meta WhatsApp credentials missing');
      return { sent: false, provider: 'meta' };
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta API ${res.status}: ${body}`);
    }

    return { sent: true, provider: 'meta' };
  }

  private async sendViaTwilio(
    phone: string,
    message: string,
  ): Promise<{ sent: boolean; provider: string }> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_WHATSAPP_FROM');
    if (!sid || !token || !from) {
      this.logger.warn('Twilio WhatsApp credentials missing');
      return { sent: false, provider: 'twilio' };
    }

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:+${phone}`,
      Body: message,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio API ${res.status}: ${text}`);
    }

    return { sent: true, provider: 'twilio' };
  }
}
