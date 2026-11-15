import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { TokenPayload } from '../../application/ports/ports';
import { DecideBudget } from '../../application/use-cases/decide-budget';
import { ProcessPaymentNotification } from '../../application/use-cases/process-payment-notification';
import { config } from '../../config';
import { Budget } from '../../domain/budget';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { isValidSignature } from '../mercado-pago-signature';

export class BudgetDecisionDto {
  @IsBoolean()
  approved: boolean;
}

export class PaymentNotificationDto {
  type?: string;
  data?: { id?: string | number };
}

const PAYMENT_TOPIC = 'payment';

const presentBudget = (budget: Budget) => ({
  id: budget.id,
  orderId: budget.orderId,
  customer: budget.customer,
  items: budget.items,
  totalAmount: budget.totalAmount,
  status: budget.status,
  checkoutUrl: budget.checkoutUrl,
  paymentId: budget.paymentId,
  createdAt: budget.createdAt,
});

@ApiTags('budgets')
@ApiBearerAuth()
@Roles('ADMIN', 'CUSTOMER')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly decideBudget: DecideBudget) {}

  @Get(':orderId')
  async findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return presentBudget(await this.decideBudget.find(orderId, user));
  }

  @Post(':orderId/decision')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: BudgetDecisionDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return presentBudget(await this.decideBudget.execute(orderId, body.approved, user));
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly processNotification: ProcessPaymentNotification) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Body() body: PaymentNotificationDto,
    @Query() query: Record<string, string>,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const topic = body?.type ?? query.type ?? query.topic;
    const paymentId = String(body?.data?.id ?? query['data.id'] ?? query.id ?? '');
    if (topic !== PAYMENT_TOPIC || !paymentId) return { received: true };

    const notification = { signature, requestId, paymentId };
    if (!isValidSignature(notification, config.mercadoPago.webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    await this.processNotification.execute(paymentId);
    return { received: true };
  }
}
