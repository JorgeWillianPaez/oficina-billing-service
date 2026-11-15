import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment, PaymentRefund, Preference } from 'mercadopago';
import {
  Checkout,
  PaymentDetails,
  PaymentGateway,
  PaymentStatus,
} from '../../application/ports/ports';
import { config } from '../../config';
import { Budget } from '../../domain/budget';

const STATUS_BY_PROVIDER_STATUS: Record<string, PaymentStatus> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'REJECTED',
};

@Injectable()
export class MercadoPagoPaymentGateway implements PaymentGateway {
  private readonly client = new MercadoPagoConfig({
    accessToken: config.mercadoPago.accessToken ?? '',
  });

  async createCheckout(budget: Budget): Promise<Checkout> {
    const preference = await new Preference(this.client).create({
      body: {
        external_reference: budget.orderId,
        notification_url: config.mercadoPago.notificationUrl,
        payer: { email: budget.customer.email, name: budget.customer.name },
        items: budget.items.map((item, index) => ({
          id: `${budget.orderId}-${index}`,
          title: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'BRL',
        })),
      },
    });
    return { checkoutId: preference.id!, checkoutUrl: preference.init_point! };
  }

  async findPayment(paymentId: string): Promise<PaymentDetails> {
    const payment = await new Payment(this.client).get({ id: paymentId });
    return {
      paymentId: String(payment.id),
      orderId: payment.external_reference ?? '',
      status: STATUS_BY_PROVIDER_STATUS[payment.status ?? ''] ?? 'PENDING',
    };
  }

  async refund(paymentId: string): Promise<void> {
    await new PaymentRefund(this.client).create({ payment_id: paymentId });
  }
}
