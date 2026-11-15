import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  BudgetRepository,
  CustomerNotifier,
  IntegrationMonitor,
  MessagePublisher,
  PaymentGateway,
} from '../../src/application/ports/ports';
import { BudgetCommands } from '../../src/application/use-cases/budget-commands';
import { ApiModule } from '../../src/presentation/api.module';
import {
  ControllablePaymentGateway,
  CUSTOMER_ID,
  generateCommand,
  InMemoryBudgetRepository,
  ORDER_ID,
  RecordingIntegrationMonitor,
  RecordingMessagePublisher,
  RecordingNotifier,
} from '../support/in-memory';

const ports = [
  { provide: BudgetRepository, useClass: InMemoryBudgetRepository },
  { provide: MessagePublisher, useClass: RecordingMessagePublisher },
  { provide: PaymentGateway, useClass: ControllablePaymentGateway },
  { provide: CustomerNotifier, useClass: RecordingNotifier },
  { provide: IntegrationMonitor, useClass: RecordingIntegrationMonitor },
];

@Global()
@Module({
  imports: [JwtModule.register({ global: true, secret: 'test-secret' })],
  providers: ports,
  exports: ports.map((port) => port.provide),
})
class InMemoryInfrastructureModule {}

describe('Billing Service API', () => {
  let app: INestApplication;
  let ownerToken: string;
  let strangerToken: string;

  const api = () => request(app.getHttpServer());
  const as = (token: string, test: request.Test) => test.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InMemoryInfrastructureModule, ApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    const jwt = app.get(JwtService);
    ownerToken = await jwt.signAsync({ sub: CUSTOMER_ID, role: 'CUSTOMER' });
    strangerToken = await jwt.signAsync({ sub: 'someone-else', role: 'CUSTOMER' });
    await app.get(BudgetCommands).generate(generateCommand);
  });

  afterAll(() => app.close());

  it('protects budgets by authentication and ownership', async () => {
    await api().get(`/budgets/${ORDER_ID}`).expect(401);
    await as(strangerToken, api().get(`/budgets/${ORDER_ID}`)).expect(403);
    await as(ownerToken, api().get('/budgets/00000000-0000-4000-8000-000000000000')).expect(404);

    const budget = await as(ownerToken, api().get(`/budgets/${ORDER_ID}`)).expect(200);
    expect(budget.body).toMatchObject({ status: 'PENDING_APPROVAL', totalAmount: 211 });
  });

  it('approves the budget and confirms the payment through the webhook', async () => {
    await as(ownerToken, api().post(`/budgets/${ORDER_ID}/decision`)).send({ approved: 'yes' }).expect(400);

    const approved = await as(ownerToken, api().post(`/budgets/${ORDER_ID}/decision`))
      .send({ approved: true })
      .expect(200);
    expect(approved.body.status).toBe('AWAITING_PAYMENT');
    expect(approved.body.checkoutUrl).toContain(ORDER_ID);

    await as(ownerToken, api().post(`/budgets/${ORDER_ID}/decision`)).send({ approved: true }).expect(422);

    await api().post('/payments/webhook').send({ type: 'merchant_order' }).expect(200);
    await api()
      .post('/payments/webhook')
      .send({ type: 'payment', data: { id: `approved:${ORDER_ID}` } })
      .expect(200, { received: true });

    const paid = await as(ownerToken, api().get(`/budgets/${ORDER_ID}`)).expect(200);
    expect(paid.body.status).toBe('PAID');
  });

  it('accepts webhook notifications sent as query parameters', async () => {
    await api().post(`/payments/webhook?type=payment&data.id=pending:${ORDER_ID}`).expect(200);
  });
});
