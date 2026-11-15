import {
  BudgetRepository,
  Checkout,
  CustomerNotifier,
  IntegrationMonitor,
  MessagePublisher,
  PaymentDetails,
  PaymentGateway,
  PaymentStatus,
} from '../../src/application/ports/ports';
import { BudgetCommands } from '../../src/application/use-cases/budget-commands';
import { DecideBudget } from '../../src/application/use-cases/decide-budget';
import { ProcessPaymentNotification } from '../../src/application/use-cases/process-payment-notification';
import { Budget } from '../../src/domain/budget';

export class InMemoryBudgetRepository implements BudgetRepository {
  readonly items = new Map<string, Budget>();

  async save(budget: Budget) {
    this.items.set(budget.orderId, budget);
  }

  async findByOrderId(orderId: string) {
    return this.items.get(orderId) ?? null;
  }
}

export class RecordingMessagePublisher implements MessagePublisher {
  readonly messages: { routingKey: string; payload: any }[] = [];

  async publish(routingKey: string, payload: object) {
    this.messages.push({ routingKey, payload });
  }

  routingKeys(): string[] {
    return this.messages.map((message) => message.routingKey);
  }
}

export class ControllablePaymentGateway implements PaymentGateway {
  readonly refunds: string[] = [];
  failure?: Error;

  async createCheckout(budget: Budget): Promise<Checkout> {
    this.failIfRequested();
    return { checkoutId: `checkout-${budget.orderId}`, checkoutUrl: `https://pay.example/${budget.orderId}` };
  }

  async findPayment(paymentId: string): Promise<PaymentDetails> {
    this.failIfRequested();
    const [status, orderId] = paymentId.split(':');
    return { paymentId, orderId, status: status.toUpperCase() as PaymentStatus };
  }

  async refund(paymentId: string): Promise<void> {
    this.failIfRequested();
    this.refunds.push(paymentId);
  }

  private failIfRequested() {
    if (this.failure) throw this.failure;
  }
}

export class RecordingNotifier implements CustomerNotifier {
  readonly sent: string[] = [];

  async budgetReady(budget: Budget) {
    this.sent.push(`budget-ready:${budget.orderId}`);
  }

  async paymentRequested(budget: Budget) {
    this.sent.push(`payment-requested:${budget.orderId}`);
  }
}

export class RecordingIntegrationMonitor implements IntegrationMonitor {
  readonly failures: string[] = [];

  failed(integration: string) {
    this.failures.push(integration);
  }
}

export const ORDER_ID = '3f1c2b5e-8a4d-4c1e-9b7a-2d6e5f4a3b21';
export const CUSTOMER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

export const generateCommand = {
  orderId: ORDER_ID,
  customer: { id: CUSTOMER_ID, name: 'Maria Silva', email: 'maria@example.com' },
  items: [
    { type: 'SERVICE' as const, name: 'Troca de óleo', unitPrice: 120, quantity: 1 },
    { type: 'PART' as const, name: 'Filtro de óleo', unitPrice: 45.5, quantity: 2 },
  ],
};

export const buildBilling = () => {
  const budgets = new InMemoryBudgetRepository();
  const gateway = new ControllablePaymentGateway();
  const publisher = new RecordingMessagePublisher();
  const notifier = new RecordingNotifier();
  const monitor = new RecordingIntegrationMonitor();
  return {
    budgets,
    gateway,
    publisher,
    notifier,
    monitor,
    commands: new BudgetCommands(budgets, gateway, publisher, notifier, monitor),
    decideBudget: new DecideBudget(budgets, gateway, publisher, notifier, monitor),
    processPayment: new ProcessPaymentNotification(budgets, gateway, publisher, monitor),
  };
};

export type Billing = ReturnType<typeof buildBilling>;
