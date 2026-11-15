import { Injectable, Logger } from '@nestjs/common';
import { Budget, BudgetCustomer, BudgetItem } from '../../domain/budget';
import { Events } from '../messaging-contracts';
import {
  BudgetRepository,
  CustomerNotifier,
  IntegrationMonitor,
  MessagePublisher,
  PaymentGateway,
} from '../ports/ports';

export interface GenerateBudgetCommand {
  orderId: string;
  customer: BudgetCustomer;
  items: BudgetItem[];
}

export interface CancelBudgetCommand {
  orderId: string;
  reason?: string;
}

@Injectable()
export class BudgetCommands {
  private readonly logger = new Logger(BudgetCommands.name);

  constructor(
    private readonly budgets: BudgetRepository,
    private readonly gateway: PaymentGateway,
    private readonly publisher: MessagePublisher,
    private readonly notifier: CustomerNotifier,
    private readonly monitor: IntegrationMonitor,
  ) {}

  async generate(command: GenerateBudgetCommand): Promise<void> {
    try {
      const budget =
        (await this.budgets.findByOrderId(command.orderId)) ?? (await this.create(command));
      await this.publisher.publish(Events.BUDGET_GENERATED, {
        orderId: budget.orderId,
        budgetId: budget.id,
        totalAmount: budget.totalAmount,
      });
    } catch (error) {
      this.logger.error({ msg: 'Budget generation failed', orderId: command.orderId, err: error });
      await this.publisher.publish(Events.BUDGET_GENERATION_FAILED, {
        orderId: command.orderId,
        reason: `Budget generation failed: ${(error as Error).message}`,
      });
    }
  }

  async cancel({ orderId }: CancelBudgetCommand): Promise<void> {
    const budget = await this.budgets.findByOrderId(orderId);
    if (budget?.isPaid) return this.refund(budget);

    if (budget?.isOpen) {
      budget.cancel();
      await this.budgets.save(budget);
    }
    await this.publisher.publish(Events.BUDGET_CANCELLED, { orderId });
  }

  private async create(command: GenerateBudgetCommand): Promise<Budget> {
    const budget = Budget.generate(command);
    await this.budgets.save(budget);
    await this.notifier.budgetReady(budget);
    return budget;
  }

  private async refund(budget: Budget): Promise<void> {
    try {
      await this.gateway.refund(budget.paymentId!);
    } catch (error) {
      this.monitor.failed('payment-gateway', budget.orderId, error);
      throw error;
    }
    budget.refund();
    await this.budgets.save(budget);
    await this.publisher.publish(Events.PAYMENT_REFUNDED, { orderId: budget.orderId });
  }
}
