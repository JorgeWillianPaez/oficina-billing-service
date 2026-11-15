import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BudgetCommands } from '../application/use-cases/budget-commands';
import { DecideBudget } from '../application/use-cases/decide-budget';
import { ProcessPaymentNotification } from '../application/use-cases/process-payment-notification';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BudgetsController, PaymentsController } from './controllers/billing.controllers';
import { DomainExceptionFilter } from './domain-exception.filter';

@Module({
  controllers: [BudgetsController, PaymentsController],
  providers: [
    BudgetCommands,
    DecideBudget,
    ProcessPaymentNotification,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [BudgetCommands],
})
export class ApiModule {}
