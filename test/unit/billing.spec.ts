import { createHmac } from 'node:crypto';
import { Commands, Events } from '../../src/application/messaging-contracts';
import { Budget, BudgetStatus } from '../../src/domain/budget';
import { DomainError, ForbiddenError, IntegrationError, NotFoundError } from '../../src/domain/errors';
import { SimulatedPaymentGateway } from '../../src/infrastructure/adapters/simulated-payment-gateway';
import { isValidSignature } from '../../src/presentation/mercado-pago-signature';
import { Billing, buildBilling, CUSTOMER_ID, generateCommand, ORDER_ID } from '../support/in-memory';

const admin = { sub: 'admin', role: 'ADMIN' as const };
const owner = { sub: CUSTOMER_ID, role: 'CUSTOMER' as const };
const stranger = { sub: 'someone-else', role: 'CUSTOMER' as const };

describe('Budget', () => {
  it('calculates the total and starts pending approval', () => {
    const budget = Budget.generate(generateCommand);
    expect(budget.totalAmount).toBe(211);
    expect(budget.status).toBe(BudgetStatus.PENDING_APPROVAL);
    expect(budget.isOpen).toBe(true);
  });

  it('rejects incomplete data', () => {
    const generate = (overrides: object) => () => Budget.generate({ ...generateCommand, ...overrides });
    expect(generate({ orderId: '' })).toThrow(DomainError);
    expect(generate({ customer: { id: CUSTOMER_ID, name: 'Maria', email: '' } })).toThrow(DomainError);
    expect(generate({ items: [] })).toThrow(DomainError);
    expect(generate({ items: [{ type: 'PART', name: 'x', unitPrice: -1, quantity: 1 }] })).toThrow(DomainError);
  });

  it('only allows transitions that match the current status', () => {
    const budget = Budget.generate(generateCommand);
    expect(() => budget.confirmPayment('1')).toThrow(DomainError);
    expect(() => budget.refund()).toThrow(DomainError);

    budget.approve({ checkoutId: 'c1', checkoutUrl: 'https://pay.example' });
    expect(() => budget.reject()).toThrow(DomainError);
    budget.confirmPayment('p1');
    expect(() => budget.cancel()).toThrow(DomainError);
    budget.refund();
    expect(budget.status).toBe(BudgetStatus.REFUNDED);
  });
});

describe('Billing use cases', () => {
  let billing: Billing;

  const budget = () => billing.budgets.items.get(ORDER_ID)!;
  const approve = () => billing.decideBudget.execute(ORDER_ID, true, owner);

  beforeEach(async () => {
    billing = buildBilling();
    await billing.commands.generate(generateCommand);
  });

  describe('generation', () => {
    it('creates the budget, notifies the customer and replies to the saga', () => {
      expect(budget().totalAmount).toBe(211);
      expect(billing.notifier.sent).toEqual([`budget-ready:${ORDER_ID}`]);
      expect(billing.publisher.messages[0]).toEqual({
        routingKey: Events.BUDGET_GENERATED,
        payload: { orderId: ORDER_ID, budgetId: budget().id, totalAmount: 211 },
      });
    });

    it('is idempotent for redelivered commands', async () => {
      const original = budget();
      await billing.commands.generate(generateCommand);
      expect(budget()).toBe(original);
      expect(billing.notifier.sent).toHaveLength(1);
      expect(billing.publisher.routingKeys()).toEqual([Events.BUDGET_GENERATED, Events.BUDGET_GENERATED]);
    });

    it('reports failure to the saga when the command is invalid', async () => {
      await billing.commands.generate({ ...generateCommand, orderId: 'other-order', items: [] });
      expect(billing.publisher.messages.at(-1)).toMatchObject({
        routingKey: Events.BUDGET_GENERATION_FAILED,
        payload: { orderId: 'other-order' },
      });
    });
  });

  describe('decision', () => {
    it('approves creating a checkout and requesting payment', async () => {
      const approved = await approve();
      expect(approved.status).toBe(BudgetStatus.AWAITING_PAYMENT);
      expect(approved.checkoutUrl).toBe(`https://pay.example/${ORDER_ID}`);
      expect(billing.publisher.messages.at(-1)).toEqual({
        routingKey: Events.BUDGET_APPROVED,
        payload: { orderId: ORDER_ID, checkoutUrl: approved.checkoutUrl },
      });
      expect(billing.notifier.sent).toContain(`payment-requested:${ORDER_ID}`);
    });

    it('rejects and informs the saga', async () => {
      const rejected = await billing.decideBudget.execute(ORDER_ID, false, admin);
      expect(rejected.status).toBe(BudgetStatus.REJECTED);
      expect(billing.publisher.routingKeys().at(-1)).toBe(Events.BUDGET_REJECTED);
    });

    it('keeps the budget pending when the payment provider is unavailable', async () => {
      billing.gateway.failure = new Error('timeout');
      await expect(approve()).rejects.toThrow(IntegrationError);
      expect(budget().status).toBe(BudgetStatus.PENDING_APPROVAL);
      expect(billing.monitor.failures).toEqual(['payment-gateway']);
    });

    it('enforces ownership and single decision', async () => {
      await expect(billing.decideBudget.find(ORDER_ID, stranger)).rejects.toThrow(ForbiddenError);
      await expect(billing.decideBudget.find('unknown', admin)).rejects.toThrow(NotFoundError);
      await approve();
      await expect(approve()).rejects.toThrow('already been decided');
    });
  });

  describe('payment notification', () => {
    beforeEach(approve);

    it('confirms an approved payment', async () => {
      await billing.processPayment.execute(`approved:${ORDER_ID}`);
      expect(budget()).toMatchObject({ status: BudgetStatus.PAID, paymentId: `approved:${ORDER_ID}` });
      expect(billing.publisher.routingKeys().at(-1)).toBe(Events.PAYMENT_CONFIRMED);
    });

    it('fails a rejected payment', async () => {
      await billing.processPayment.execute(`rejected:${ORDER_ID}`);
      expect(budget().status).toBe(BudgetStatus.PAYMENT_FAILED);
      expect(billing.publisher.routingKeys().at(-1)).toBe(Events.PAYMENT_FAILED);
    });

    it('ignores pending, duplicated and unknown notifications', async () => {
      await billing.processPayment.execute(`pending:${ORDER_ID}`);
      expect(budget().status).toBe(BudgetStatus.AWAITING_PAYMENT);

      await billing.processPayment.execute(`approved:${ORDER_ID}`);
      const published = billing.publisher.messages.length;
      await billing.processPayment.execute(`approved:${ORDER_ID}`);
      await billing.processPayment.execute('approved:unknown-order');
      expect(billing.publisher.messages).toHaveLength(published);
    });

    it('surfaces provider failures', async () => {
      billing.gateway.failure = new Error('timeout');
      await expect(billing.processPayment.execute(`approved:${ORDER_ID}`)).rejects.toThrow('timeout');
      expect(billing.monitor.failures).toEqual(['payment-gateway']);
    });
  });

  describe('cancellation', () => {
    it('cancels an open budget', async () => {
      await billing.commands.cancel({ orderId: ORDER_ID });
      expect(budget().status).toBe(BudgetStatus.CANCELLED);
      expect(billing.publisher.routingKeys().at(-1)).toBe(Events.BUDGET_CANCELLED);
    });

    it('refunds a paid budget', async () => {
      await approve();
      await billing.processPayment.execute(`approved:${ORDER_ID}`);
      await billing.commands.cancel({ orderId: ORDER_ID });

      expect(billing.gateway.refunds).toEqual([`approved:${ORDER_ID}`]);
      expect(budget().status).toBe(BudgetStatus.REFUNDED);
      expect(billing.publisher.routingKeys().at(-1)).toBe(Events.PAYMENT_REFUNDED);
    });

    it('keeps the budget paid when the refund fails', async () => {
      await approve();
      await billing.processPayment.execute(`approved:${ORDER_ID}`);
      billing.gateway.failure = new Error('refund unavailable');

      await expect(billing.commands.cancel({ orderId: ORDER_ID })).rejects.toThrow('refund unavailable');
      expect(budget().status).toBe(BudgetStatus.PAID);
    });

    it('confirms cancellation for unknown or already closed budgets', async () => {
      await billing.decideBudget.execute(ORDER_ID, false, admin);
      await billing.commands.cancel({ orderId: ORDER_ID });
      await billing.commands.cancel({ orderId: 'unknown-order' });

      expect(budget().status).toBe(BudgetStatus.REJECTED);
      expect(billing.publisher.routingKeys().slice(-2)).toEqual([
        Events.BUDGET_CANCELLED,
        Events.BUDGET_CANCELLED,
      ]);
    });
  });
});

describe('SimulatedPaymentGateway', () => {
  const gateway = new SimulatedPaymentGateway();

  it('creates simulated checkouts and resolves payments from their id', async () => {
    const checkout = await gateway.createCheckout(Budget.generate(generateCommand));
    expect(checkout.checkoutId).toBe(`simulated-${ORDER_ID}`);
    await expect(gateway.findPayment(`approved:${ORDER_ID}`)).resolves.toEqual({
      paymentId: `approved:${ORDER_ID}`,
      orderId: ORDER_ID,
      status: 'APPROVED',
    });
    await expect(gateway.findPayment('123')).rejects.toThrow();
    await expect(gateway.refund()).resolves.toBeUndefined();
  });
});

describe('Mercado Pago webhook signature', () => {
  const secret = 'webhook-secret';
  const sign = (paymentId: string, requestId: string, ts: string) =>
    createHmac('sha256', secret).update(`id:${paymentId};request-id:${requestId};ts:${ts};`).digest('hex');

  it('accepts everything when no secret is configured', () => {
    expect(isValidSignature({ paymentId: '1' })).toBe(true);
  });

  it('validates the HMAC of the notification', () => {
    const signature = `ts=1700000000,v1=${sign('123', 'req-1', '1700000000')}`;
    expect(isValidSignature({ signature, requestId: 'req-1', paymentId: '123' }, secret)).toBe(true);
    expect(isValidSignature({ signature, requestId: 'req-2', paymentId: '123' }, secret)).toBe(false);
    expect(isValidSignature({ signature: 'ts=1,v1=abc', paymentId: '123' }, secret)).toBe(false);
    expect(isValidSignature({ paymentId: '123' }, secret)).toBe(false);
  });
});

describe('messaging contracts', () => {
  it('routes billing commands to the billing queue', () => {
    expect(Commands.GENERATE_BUDGET.startsWith('billing.command.')).toBe(true);
    expect(Commands.CANCEL_BUDGET.startsWith('billing.command.')).toBe(true);
  });
});
