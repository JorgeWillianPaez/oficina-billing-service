import assert from 'node:assert/strict';
import { Before, Given, Then, When } from '@cucumber/cucumber';
import { Billing, buildBilling, CUSTOMER_ID, generateCommand, ORDER_ID } from '../../support/in-memory';

interface Scenario {
  billing: Billing;
}

Before(function (this: Scenario) {
  this.billing = buildBilling();
});

Given(
  'um orçamento gerado para uma ordem de serviço de {float}',
  async function (this: Scenario, total: number) {
    await this.billing.commands.generate(generateCommand);
    assert.equal(this.billing.budgets.items.get(ORDER_ID)?.totalAmount, total);
  },
);

When('o cliente aprova o orçamento', async function (this: Scenario) {
  await this.billing.decideBudget.execute(ORDER_ID, true, { sub: CUSTOMER_ID, role: 'CUSTOMER' });
});

When('o provedor notifica o pagamento como {string}', async function (this: Scenario, status: string) {
  await this.billing.processPayment.execute(`${status}:${ORDER_ID}`);
});

When('a saga solicita o cancelamento do orçamento', async function (this: Scenario) {
  await this.billing.commands.cancel({ orderId: ORDER_ID });
});

Then('o orçamento fica com status {string}', function (this: Scenario, status: string) {
  assert.equal(this.billing.budgets.items.get(ORDER_ID)?.status, status);
});

Then('o cliente recebe o link de pagamento', function (this: Scenario) {
  assert.ok(this.billing.notifier.sent.includes(`payment-requested:${ORDER_ID}`));
});

Then('a saga é informada com {string}', function (this: Scenario, routingKey: string) {
  assert.equal(this.billing.publisher.routingKeys().at(-1), routingKey);
});
