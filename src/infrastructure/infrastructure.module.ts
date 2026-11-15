import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  BudgetRepository,
  CustomerNotifier,
  IntegrationMonitor,
  MessagePublisher,
  PaymentGateway,
} from '../application/ports/ports';
import { config } from '../config';
import { MercadoPagoPaymentGateway } from './adapters/mercado-pago-payment-gateway';
import { SimulatedPaymentGateway } from './adapters/simulated-payment-gateway';
import { SmtpCustomerNotifier } from './adapters/smtp-customer-notifier';
import { HealthController } from './health.controller';
import { RabbitMqMessagePublisher } from './messaging/rabbitmq-message-publisher';
import { RabbitMqClient } from './messaging/rabbitmq.client';
import { NewRelicIntegrationMonitor } from './observability/new-relic-integration-monitor';
import { PrismaBudgetRepository } from './persistence/prisma-budget.repository';
import { PrismaService } from './persistence/prisma.service';

const ports = [
  { provide: BudgetRepository, useClass: PrismaBudgetRepository },
  { provide: MessagePublisher, useClass: RabbitMqMessagePublisher },
  { provide: CustomerNotifier, useClass: SmtpCustomerNotifier },
  { provide: IntegrationMonitor, useClass: NewRelicIntegrationMonitor },
  {
    provide: PaymentGateway,
    useClass: config.mercadoPago.accessToken ? MercadoPagoPaymentGateway : SimulatedPaymentGateway,
  },
];

@Global()
@Module({
  imports: [JwtModule.register({ global: true, secret: config.jwtSecret })],
  controllers: [HealthController],
  providers: [PrismaService, RabbitMqClient, ...ports],
  exports: [RabbitMqClient, ...ports.map((port) => port.provide)],
})
export class InfrastructureModule {}
