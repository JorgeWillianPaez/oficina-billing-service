import { Injectable } from '@nestjs/common';
import { Budget } from '../../domain/budget';
import { DomainError, ForbiddenError, IntegrationError, NotFoundError } from '../../domain/errors';
import { Events } from '../messaging-contracts';
import {
  BudgetRepository,
  Checkout,
  CustomerNotifier,
  IntegrationMonitor,
  MessagePublisher,
  PaymentGateway,
  TokenPayload,
} from '../ports/ports';

@Injectable()
export class DecideBudget {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly gateway: PaymentGateway,
    private readonly publisher: MessagePublisher,
    private readonly notifier: CustomerNotifier,
    private readonly monitor: IntegrationMonitor,
  ) {}

  async find(orderId: string, requester: TokenPayload): Promise<Budget> {
    const budget = await this.budgets.findByOrderId(orderId);
    if (!budget) throw new NotFoundError('Budget not found');
    if (requester.role === 'CUSTOMER' && budget.customer.id !== requester.sub) {
      throw new ForbiddenError('Budget belongs to another customer');
    }
    return budget;
  }

  async execute(orderId: string, approved: boolean, requester: TokenPayload): Promise<Budget> {
    const budget = await this.find(orderId, requester);
    if (!budget.isPendingApproval) throw new DomainError('Budget has already been decided');
    return approved ? this.approve(budget) : this.reject(budget);
  }

  private async approve(budget: Budget): Promise<Budget> {
    budget.approve(await this.createCheckout(budget));
    await this.budgets.save(budget);
    await this.publisher.publish(Events.BUDGET_APPROVED, {
      orderId: budget.orderId,
      checkoutUrl: budget.checkoutUrl,
    });
    await this.notifier.paymentRequested(budget);
    return budget;
  }

  private async reject(budget: Budget): Promise<Budget> {
    budget.reject();
    await this.budgets.save(budget);
    await this.publisher.publish(Events.BUDGET_REJECTED, {
      orderId: budget.orderId,
      reason: 'Budget rejected by the customer',
    });
    return budget;
  }

  private async createCheckout(budget: Budget): Promise<Checkout> {
    try {
      return await this.gateway.createCheckout(budget);
    } catch (error) {
      this.monitor.failed('payment-gateway', budget.orderId, error);
      throw new IntegrationError('Payment provider is unavailable, try again later');
    }
  }
}
