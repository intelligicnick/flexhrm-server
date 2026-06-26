import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Subscription, SubscriptionDocument } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../../schemas/subscription-plan.schema';
import { Invoice, InvoiceDocument } from '../../schemas/invoice.schema';
import { PaymentTransaction, PaymentTransactionDocument } from '../../schemas/payment-transaction.schema';
import { Tenant, TenantDocument } from '../../schemas/tenant.schema';
import { generateToken } from '../../../common/utils/password.util';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name) private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(PaymentTransaction.name) private readonly paymentModel: Model<PaymentTransactionDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    private readonly configService: ConfigService,
  ) {}

  async getPlans(): Promise<Record<string, unknown>[]> {
    return this.planModel.find({ active: true }).sort({ sortOrder: 1 }).lean() as Promise<
      Record<string, unknown>[]
    >;
  }

  async getTenantSubscription(tenantId: string): Promise<Record<string, unknown>> {
    const subscription = await this.subscriptionModel.findOne({ tenantId }).lean();
    if (!subscription) throw new NotFoundException('No subscription found');
    const plan = await this.planModel.findOne({ id: subscription.planId }).lean();
    return { subscription, plan };
  }

  async createCheckoutOrder(
    tenantId: string,
    planId: string,
    billingCycle: 'monthly' | 'quarterly' | 'annual',
  ): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id: planId, active: true }).lean();
    if (!plan) throw new NotFoundException('Plan not found');

    const amount =
      billingCycle === 'annual'
        ? plan.priceAnnual
        : billingCycle === 'quarterly'
          ? plan.priceQuarterly
          : plan.priceMonthly;

    const razorpayKeyId = this.configService.get<string>('razorpayKeyId') ?? '';

    if (!razorpayKeyId) {
      return {
        mode: 'manual',
        message: 'Payment gateway not configured. Contact platform admin to activate your plan.',
        planId,
        billingCycle,
        amount,
        currency: plan.currency,
      };
    }

    const orderId = `order_${generateToken().slice(0, 16)}`;
    await this.paymentModel.create({
      id: `pay_${generateToken().slice(0, 12)}`,
      tenantId,
      gateway: 'razorpay',
      gatewayTransactionId: orderId,
      amount,
      currency: plan.currency,
      status: 'pending',
    });

    return {
      mode: 'razorpay',
      keyId: razorpayKeyId,
      orderId,
      amount: amount * 100,
      currency: plan.currency,
      planId,
      billingCycle,
      planName: plan.name,
    };
  }

  async handleRazorpayWebhook(payload: Record<string, unknown>): Promise<void> {
    const event = String(payload.event ?? '');
    const paymentPayload = payload.payload as {
      payment?: { entity?: Record<string, unknown> };
    } | undefined;
    const paymentEntity = paymentPayload?.payment?.entity;

    if (!paymentEntity) return;

    const orderId = String(paymentEntity.order_id ?? '');
    const status = event.includes('captured') || event.includes('paid') ? 'success' : 'failed';

    const payment = await this.paymentModel.findOne({ gatewayTransactionId: orderId });
    if (!payment) return;

    payment.status = status as 'success' | 'failed';
    payment.gatewayResponse = payload;
    if (status === 'failed') {
      payment.failureReason = String(paymentEntity.error_description ?? 'Payment failed');
    }
    await payment.save();

    if (status === 'success') {
      await this.activateSubscription(payment.tenantId, payment.amount);
    } else {
      await this.handleFailedPayment(payment.tenantId);
    }
  }

  private async activateSubscription(tenantId: string, amount: number): Promise<void> {
    const subscription = await this.subscriptionModel.findOne({ tenantId });
    if (!subscription) return;

    subscription.status = 'active';
    subscription.failedPaymentAttempts = 0;
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = new Date(Date.now() + 30 * 86400000);
    await subscription.save();

    await this.tenantModel.updateOne({ id: tenantId }, { status: 'active' });

    const gstAmount = Math.round(amount * 0.18);
    await this.invoiceModel.create({
      id: `inv_${generateToken().slice(0, 12)}`,
      tenantId,
      subscriptionId: subscription.id,
      invoiceNumber: `FH-${Date.now()}`,
      subtotal: amount,
      gstAmount,
      total: amount + gstAmount,
      currency: 'INR',
      status: 'paid',
      lineItems: [{ description: 'Subscription payment', amount, gstRate: 18, gstAmount }],
      paidAt: new Date(),
    });
  }

  private async handleFailedPayment(tenantId: string): Promise<void> {
    const subscription = await this.subscriptionModel.findOne({ tenantId });
    if (!subscription) return;

    subscription.failedPaymentAttempts += 1;
    if (subscription.failedPaymentAttempts >= 3) {
      subscription.status = 'past_due';
      await this.tenantModel.updateOne({ id: tenantId }, { status: 'suspended' });
    }
    await subscription.save();
  }

  async getInvoices(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.invoiceModel
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async getPaymentHistory(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.paymentModel
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async getAllInvoices(page = 1, pageSize = 50): Promise<Record<string, unknown>[]> {
    const skip = (page - 1) * pageSize;
    return this.invoiceModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async getAllPayments(page = 1, pageSize = 50): Promise<Record<string, unknown>[]> {
    const skip = (page - 1) * pageSize;
    return this.paymentModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async getFailedPayments(): Promise<Record<string, unknown>[]> {
    return this.paymentModel
      .find({ status: 'failed' })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async getPlatformRevenue(): Promise<Record<string, unknown>> {
    const paidInvoices = await this.invoiceModel.find({ status: 'paid' }).lean();
    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0);
    const activeSubscriptions = await this.subscriptionModel.countDocuments({ status: 'active' });
    const trialing = await this.subscriptionModel.countDocuments({ status: 'trialing' });
    const pastDue = await this.subscriptionModel.countDocuments({ status: 'past_due' });

    return {
      totalRevenue,
      invoiceCount: paidInvoices.length,
      activeSubscriptions,
      trialing,
      pastDue,
      mrr: activeSubscriptions > 0 ? Math.round(totalRevenue / Math.max(paidInvoices.length, 1)) : 0,
    };
  }

  async createStripeCheckout(
    tenantId: string,
    planId: string,
    billingCycle: 'monthly' | 'quarterly' | 'annual',
  ): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id: planId, active: true }).lean();
    if (!plan) throw new NotFoundException('Plan not found');

    const amount =
      billingCycle === 'annual'
        ? plan.priceAnnual
        : billingCycle === 'quarterly'
          ? plan.priceQuarterly
          : plan.priceMonthly;

    const stripeKey = this.configService.get<string>('stripeSecretKey') ?? '';
    if (!stripeKey) {
      return {
        mode: 'manual',
        message: 'Stripe not configured. Contact platform admin.',
        planId,
        billingCycle,
        amount,
      };
    }

    const sessionId = `cs_${generateToken().slice(0, 16)}`;
    await this.paymentModel.create({
      id: `pay_${generateToken().slice(0, 12)}`,
      tenantId,
      gateway: 'stripe',
      gatewayTransactionId: sessionId,
      amount,
      currency: plan.currency,
      status: 'pending',
    });

    return {
      mode: 'stripe',
      sessionId,
      amount: amount * 100,
      currency: plan.currency,
      planId,
      billingCycle,
      planName: plan.name,
    };
  }

  async createPayPalCheckout(
    tenantId: string,
    planId: string,
    billingCycle: 'monthly' | 'quarterly' | 'annual',
  ): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id: planId, active: true }).lean();
    if (!plan) throw new NotFoundException('Plan not found');

    const amount =
      billingCycle === 'annual'
        ? plan.priceAnnual
        : billingCycle === 'quarterly'
          ? plan.priceQuarterly
          : plan.priceMonthly;

    const orderId = `paypal_${generateToken().slice(0, 16)}`;
    await this.paymentModel.create({
      id: `pay_${generateToken().slice(0, 12)}`,
      tenantId,
      gateway: 'paypal',
      gatewayTransactionId: orderId,
      amount,
      currency: plan.currency,
      status: 'pending',
    });

    return {
      mode: 'paypal',
      orderId,
      amount,
      currency: plan.currency,
      planId,
      billingCycle,
      planName: plan.name,
    };
  }

  async handleStripeWebhook(
    payload: Record<string, unknown>,
    _signature?: string,
  ): Promise<void> {
    const eventType = String(payload.type ?? '');
    if (eventType === 'checkout.session.completed') {
      const data = payload.data as { object?: { id?: string; amount_total?: number } } | undefined;
      const sessionId = data?.object?.id ?? '';
      const payment = await this.paymentModel.findOne({ gatewayTransactionId: sessionId });
      if (payment) {
        payment.status = 'success';
        await payment.save();
        await this.activateSubscription(payment.tenantId, payment.amount);
      }
    }
  }

  async handlePayPalWebhook(payload: Record<string, unknown>): Promise<void> {
    const eventType = String(payload.event_type ?? '');
    if (eventType.includes('PAYMENT.CAPTURE.COMPLETED')) {
      const resource = payload.resource as { id?: string; amount?: { value?: string } } | undefined;
      const orderId = String(resource?.id ?? '');
      const payment = await this.paymentModel.findOne({ gatewayTransactionId: orderId });
      if (payment) {
        payment.status = 'success';
        await payment.save();
        await this.activateSubscription(payment.tenantId, payment.amount);
      }
    }
  }

  async generateGstInvoice(tenantId: string, invoiceId: string): Promise<Record<string, unknown>> {
    const invoice = await this.invoiceModel.findOne({ id: invoiceId, tenantId }).lean();
    if (!invoice) throw new NotFoundException('Invoice not found');

    const tenant = await this.tenantModel.findOne({ id: tenantId }).lean();
    const gstin = tenant?.gstNumber ?? '';

    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: (invoice as { createdAt?: Date }).createdAt ?? invoice.paidAt ?? new Date(),
      seller: {
        name: 'Flex HRM Platform',
        gstin: '29XXXXX0000X1XX',
        address: 'India',
      },
      buyer: {
        name: tenant?.legalName ?? tenant?.companyName ?? 'Customer',
        gstin,
        address: tenant?.address ?? '',
        state: tenant?.state ?? '',
      },
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      cgst: Math.round((invoice.gstAmount ?? 0) / 2),
      sgst: Math.round((invoice.gstAmount ?? 0) / 2),
      total: invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      hsnSac: '998314',
    };
  }
}
