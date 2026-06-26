import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { BillingService } from './billing.service';
import { verifyRazorpayWebhookSignature } from '../../../common/utils/razorpay-webhook.util';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('plans')
  async plans() {
    return this.billingService.getPlans();
  }

  @Get('subscription')
  async subscription(@Req() req: Request) {
    return this.billingService.getTenantSubscription(req.tenantId ?? 'default');
  }

  @Post('checkout')
  async checkout(
    @Body() body: {
      planId: string;
      billingCycle: 'monthly' | 'quarterly' | 'annual';
      gateway?: 'razorpay' | 'stripe' | 'paypal';
    },
    @Req() req: Request,
  ) {
    const gateway = body.gateway ?? 'razorpay';
    if (gateway === 'stripe') {
      return this.billingService.createStripeCheckout(
        req.tenantId ?? 'default',
        body.planId,
        body.billingCycle,
      );
    }
    if (gateway === 'paypal') {
      return this.billingService.createPayPalCheckout(
        req.tenantId ?? 'default',
        body.planId,
        body.billingCycle,
      );
    }
    return this.billingService.createCheckoutOrder(
      req.tenantId ?? 'default',
      body.planId,
      body.billingCycle,
    );
  }

  @Get('invoices')
  async invoices(@Req() req: Request) {
    return this.billingService.getInvoices(req.tenantId ?? 'default');
  }

  @Get('payments')
  async payments(@Req() req: Request) {
    return this.billingService.getPaymentHistory(req.tenantId ?? 'default');
  }

  @Public()
  @PlatformAdminOnly()
  @Get('admin/invoices')
  async allInvoices(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.billingService.getAllInvoices(Number(page) || 1, Number(pageSize) || 50);
  }

  @Public()
  @PlatformAdminOnly()
  @Get('admin/payments')
  async allPayments(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.billingService.getAllPayments(Number(page) || 1, Number(pageSize) || 50);
  }

  @Public()
  @PlatformAdminOnly()
  @Get('admin/failed-payments')
  async failedPayments() {
    return this.billingService.getFailedPayments();
  }

  @Public()
  @PlatformAdminOnly()
  @Get('revenue')
  async revenue() {
    return this.billingService.getPlatformRevenue();
  }

  @Public()
  @Post('webhooks/razorpay')
  async razorpayWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    const secret = this.configService.get<string>('razorpayWebhookSecret') ?? '';
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(payload);
    if (secret && !verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
    await this.billingService.handleRazorpayWebhook(payload);
    return { received: true };
  }

  @Public()
  @Post('webhooks/stripe')
  async stripeWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    await this.billingService.handleStripeWebhook(payload, signature);
    return { received: true };
  }

  @Public()
  @Post('webhooks/paypal')
  async paypalWebhook(@Body() payload: Record<string, unknown>) {
    await this.billingService.handlePayPalWebhook(payload);
    return { received: true };
  }

  @Get('invoices/:id/gst')
  async gstInvoice(@Req() req: Request, @Param('id') id: string) {
    return this.billingService.generateGstInvoice(req.tenantId ?? 'default', id);
  }
}
