import { Budget } from '../../domain/budget';

export type Role = 'ADMIN' | 'CUSTOMER';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export abstract class BudgetRepository {
  abstract save(budget: Budget): Promise<void>;
  abstract findByOrderId(orderId: string): Promise<Budget | null>;
}

export abstract class MessagePublisher {
  abstract publish(routingKey: string, payload: object): Promise<void>;
}

export type PaymentStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

export interface Checkout {
  checkoutId: string;
  checkoutUrl: string;
}

export interface PaymentDetails {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
}

export abstract class PaymentGateway {
  abstract createCheckout(budget: Budget): Promise<Checkout>;
  abstract findPayment(paymentId: string): Promise<PaymentDetails>;
  abstract refund(paymentId: string): Promise<void>;
}

export abstract class CustomerNotifier {
  abstract budgetReady(budget: Budget): Promise<void>;
  abstract paymentRequested(budget: Budget): Promise<void>;
}

export abstract class IntegrationMonitor {
  abstract failed(integration: string, orderId: string, error: unknown): void;
}
