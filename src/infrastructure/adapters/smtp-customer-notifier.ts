import { Injectable } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { CustomerNotifier, IntegrationMonitor } from '../../application/ports/ports';
import { config } from '../../config';
import { Budget } from '../../domain/budget';

const formatMoney = (value: number) => `R$ ${value.toFixed(2)}`;

@Injectable()
export class SmtpCustomerNotifier implements CustomerNotifier {
  private readonly transporter?: Transporter = config.smtp.host
    ? createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        auth: config.smtp.user
          ? { user: config.smtp.user, pass: config.smtp.password }
          : undefined,
      })
    : undefined;

  constructor(private readonly monitor: IntegrationMonitor) {}

  budgetReady(budget: Budget): Promise<void> {
    const items = budget.items.map(
      (item) => `- ${item.quantity}x ${item.name}: ${formatMoney(item.unitPrice * item.quantity)}`,
    );
    return this.send(budget, 'Orçamento disponível para aprovação', [
      `Olá, ${budget.customer.name}.`,
      `O orçamento da ordem de serviço ${budget.orderId} está pronto:`,
      ...items,
      `Total: ${formatMoney(budget.totalAmount)}`,
      'Aprove ou recuse o orçamento pelo aplicativo da oficina.',
    ]);
  }

  paymentRequested(budget: Budget): Promise<void> {
    return this.send(budget, 'Pagamento da ordem de serviço', [
      `Olá, ${budget.customer.name}.`,
      `Orçamento aprovado. Total: ${formatMoney(budget.totalAmount)}`,
      `Realize o pagamento em: ${budget.checkoutUrl}`,
    ]);
  }

  private async send(budget: Budget, subject: string, lines: string[]): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to: budget.customer.email,
        subject,
        text: lines.join('\n'),
      });
    } catch (error) {
      this.monitor.failed('smtp', budget.orderId, error);
    }
  }
}
