import { Injectable } from '@nestjs/common';
import {
  Checkout,
  PaymentDetails,
  PaymentGateway,
  PaymentStatus,
} from '../../application/ports/ports';
import { Budget } from '../../domain/budget';

const PAYMENT_ID_PATTERN = /^(approved|rejected):(.+)$/;

@Injectable()
export class SimulatedPaymentGateway implements PaymentGateway {
  async createCheckout(budget: Budget): Promise<Checkout> {
    return {
      checkoutId: `simulated-${budget.orderId}`,
      checkoutUrl: `simulated://checkout/${budget.orderId}`,
    };
  }

  async findPayment(paymentId: string): Promise<PaymentDetails> {
    const [, status, orderId] = PAYMENT_ID_PATTERN.exec(paymentId) ?? [];
    if (!orderId) throw new Error('Simulated payment id must be approved:<orderId> or rejected:<orderId>');
    return { paymentId, orderId, status: status.toUpperCase() as PaymentStatus };
  }

  async refund(): Promise<void> {}
}
