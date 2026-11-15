import { Injectable, Logger } from '@nestjs/common';
import { Events } from '../messaging-contracts';
import {
  BudgetRepository,
  IntegrationMonitor,
  MessagePublisher,
  PaymentDetails,
  PaymentGateway,
} from '../ports/ports';

@Injectable()
export class ProcessPaymentNotification {
  private readonly logger = new Logger(ProcessPaymentNotification.name);

  constructor(
    private readonly budgets: BudgetRepository,
    private readonly gateway: PaymentGateway,
    private readonly publisher: MessagePublisher,
    private readonly monitor: IntegrationMonitor,
  ) {}

  async execute(paymentId: string): Promise<void> {
    const payment = await this.findPayment(paymentId);
    if (payment.status === 'PENDING') return;

    const budget = await this.budgets.findByOrderId(payment.orderId);
    if (!budget?.isAwaitingPayment) {
      this.logger.warn({ msg: 'Payment notification ignored', paymentId, orderId: payment.orderId });
      return;
    }

    if (payment.status === 'APPROVED') {
      budget.confirmPayment(payment.paymentId);
      await this.budgets.save(budget);
      await this.publisher.publish(Events.PAYMENT_CONFIRMED, { orderId: budget.orderId });
      return;
    }

    budget.failPayment(payment.paymentId);
    await this.budgets.save(budget);
    await this.publisher.publish(Events.PAYMENT_FAILED, {
      orderId: budget.orderId,
      reason: 'Payment was not approved',
    });
  }

  private async findPayment(paymentId: string): Promise<PaymentDetails> {
    try {
      return await this.gateway.findPayment(paymentId);
    } catch (error) {
      this.monitor.failed('payment-gateway', paymentId, error);
      throw error;
    }
  }
}
