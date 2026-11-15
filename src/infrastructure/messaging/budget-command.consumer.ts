import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Commands } from '../../application/messaging-contracts';
import { BudgetCommands } from '../../application/use-cases/budget-commands';
import { RabbitMqClient } from './rabbitmq.client';

const QUEUE = 'billing-service.commands';
const BINDINGS = ['billing.command.*'];

@Injectable()
export class BudgetCommandConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly client: RabbitMqClient,
    private readonly commands: BudgetCommands,
  ) {}

  onApplicationBootstrap(): void {
    void this.client.subscribe(QUEUE, BINDINGS, async (command, payload) => {
      if (command === Commands.GENERATE_BUDGET) await this.commands.generate(payload);
      if (command === Commands.CANCEL_BUDGET) await this.commands.cancel(payload);
    });
  }
}
