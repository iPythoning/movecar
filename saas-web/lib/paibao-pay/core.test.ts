import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  applyFulfillment, Fulfillment, FulfillmentRepository, metadataOf, moneyToCents,
  parseFulfillment, PaymentError, PaymentOrder, PlanInput,
  reusableCheckout, snapshotPlan, validateFulfillment, verifySignature,
} from './core';
import { createGatewayCheckout, parseCheckoutSession, reconcileGatewayOrder } from './gateway';

const planId = '5c83c82b-37e8-406e-9f39-cafcab459e2d';
const orderId = '0bffde03-bb00-4d42-92d0-89259ff2aab6';
const now = new Date('2026-10-01T16:00:00Z');
const plan: PlanInput = {
  id: planId, environment: 'test', isActive: true, cardTitle: 'Lifetime', paymentType: 'one_time',
  recurringInterval: null, price: '29', currency: 'USD', benefitsJsonb: { movecarPlanType: 'lifetime' },
};
const snapshot = snapshotPlan(plan, 'test');
const checkout = {
  gatewayOrderId: 'ps_test_gateway', sessionId: 'cs_test_session',
  checkoutUrl: 'https://checkout.test.example/session', expiresAt: '2026-10-02T16:00:00Z',
};
function order(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    id: orderId, userId: 'user-test', provider: 'paibao', providerOrderId: checkout.gatewayOrderId,
    orderType: 'one_time_purchase', status: 'pending', planId, productId: planId,
    amountTotal: '29.00', currency: 'USD', metadata: { snapshot, checkoutState: 'ready', checkout }, ...overrides,
  };
}
const payload: Fulfillment = {
  ref: orderId, product_id: planId, out_trade_no: checkout.gatewayOrderId, channel: 'stripe',
  event_type: 'checkout.session.completed', stripe_txn: 'pi_test_actual', amount_cents: 2900, currency: 'USD',
};
const errorCode = (code: string) => (error: unknown) => error instanceof PaymentError && error.code === code;

test('DB quote validates active environment, lifetime semantics and exact cents', () => {
  assert.equal(snapshot.amountCents, 2900);
  assert.equal(moneyToCents('4.90'), 490);
  assert.equal(moneyToCents('29.0000'), 2900);
  for (const price of ['0', '-1', '1.001', '1e3', 'Infinity', '9007199254740992']) {
    assert.throws(() => moneyToCents(price));
  }
  for (const fields of [{ isActive: false }, { environment: 'live' }, { benefitsJsonb: {} }, { currency: 'JPY' }, { recurringInterval: 'month' }]) {
    assert.throws(() => snapshotPlan({ ...plan, ...fields }, 'test'));
  }
  assert.throws(() => snapshotPlan({ ...plan, paymentType: 'recurring' }, 'test'), errorCode('subscription_contract_missing'));
});

test('HMAC checks the untouched bytes before parsing, rejecting tampering and missing signature', () => {
  const secret = 'synthetic-test-secret';
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(Buffer.from(`${raw.toString()} `), signature, secret), false);
  assert.equal(verifySignature(raw, null, secret), false);
  assert.equal(verifySignature(raw, 'zz'.repeat(32), secret), false);
  assert.equal(verifySignature(raw, signature, ''), false);
  assert.deepEqual(parseFulfillment(raw), payload);
});

test('callback parser rejects unsupported channels, invoices, absent actual transactions and fractional amounts', () => {
  for (const fields of [{ channel: 'wechat' }, { event_type: 'invoice.paid' }, { stripe_txn: '' }, { amount_cents: 29.1 }, { ref: 'invalid' }]) {
    assert.throws(() => parseFulfillment(Buffer.from(JSON.stringify({ ...payload, ...fields }))), errorCode('callback_invalid'));
  }
});

test('signed delivery must match the original ref, SKU, gateway ID, amount, currency and order kind', () => {
  assert.equal(validateFulfillment(order(), payload), 'deliver');
  assert.equal(validateFulfillment(order(), { ...payload, currency: 'usd' }), 'deliver');
  for (const fields of [{ ref: planId }, { product_id: orderId }, { out_trade_no: 'other' }, { amount_cents: 1 }, { currency: 'CNY' }]) {
    assert.throws(() => validateFulfillment(order(), { ...payload, ...fields }), errorCode('payment_mismatch'));
  }
  assert.throws(() => validateFulfillment(order({ orderType: 'recurring' }), payload), errorCode('payment_mismatch'));
  assert.throws(() => validateFulfillment(order({ amountTotal: '1' }), payload), errorCode('order_snapshot_invalid'));
});

test('unknown checkout outcomes cannot grant access or create replacement sessions', () => {
  for (const checkoutState of ['creating', 'unknown'] as const) {
    const pending = order({ metadata: { snapshot, checkoutState } });
    assert.throws(() => reusableCheckout(pending, snapshot, now), errorCode('checkout_pending_review'));
    assert.throws(() => validateFulfillment(pending, payload), errorCode('checkout_not_saved'));
  }
  assert.deepEqual(reusableCheckout(order(), snapshot, now), checkout);
  assert.throws(() => reusableCheckout(order(), snapshot, new Date(checkout.expiresAt)), errorCode('checkout_pending_review'));
  assert.throws(() => reusableCheckout(order(), { ...snapshot, amountCents: 100 }, now), errorCode('checkout_pending_review'));
});

function repository(rows: PaymentOrder[], planType = 'lifetime') {
  const calls: string[] = [];
  const repo: FulfillmentRepository = {
    async lockTransaction(id) { calls.push(`transaction:${id}`); },
    async lockOrder(id) { calls.push(`order:${id}`); return rows.find(row => row.id === id); },
    async findTransaction(id) { return rows.find(row => metadataOf(row).transactionId === id); },
    async planType() { return planType; },
    async succeed(row, metadata) { calls.push('succeed'); row.status = 'succeeded'; row.metadata = metadata; },
  };
  return { repo, calls };
}

test('transaction lock precedes order lock, delivery is idempotent, other transactions conflict', async () => {
  const row = order();
  const { repo, calls } = repository([row]);
  assert.equal(await applyFulfillment(repo, payload), 'delivered');
  assert.equal(row.status, 'succeeded');
  assert.deepEqual(calls.slice(0, 2), [`transaction:${payload.stripe_txn}`, `order:${orderId}`]);
  assert.equal(await applyFulfillment(repo, payload), 'duplicate');
  assert.equal(calls.filter(call => call === 'succeed').length, 1);
  await assert.rejects(applyFulfillment(repo, { ...payload, stripe_txn: 'pi_other' }), errorCode('transaction_conflict'));
});

test('a transaction bound to another order cannot be reused and changed plans cannot silently gain lifetime', async () => {
  const other = order({ id: planId, status: 'succeeded', metadata: { snapshot, checkoutState: 'ready', checkout, transactionId: payload.stripe_txn } });
  const row = order();
  const { repo } = repository([row, other]);
  await assert.rejects(applyFulfillment(repo, payload), errorCode('transaction_reused'));
  assert.equal(row.status, 'pending');
  await assert.rejects(applyFulfillment(repository([order()], 'pro_monthly').repo, payload), errorCode('plan_changed'));
});

test('checkout responses require a trustworthy HTTPS origin, identifiers and a future expiry', () => {
  const valid = { order_id: checkout.gatewayOrderId, session_id: checkout.sessionId, checkout_url: checkout.checkoutUrl, expires_at: checkout.expiresAt };
  assert.deepEqual(parseCheckoutSession(valid, ['https://checkout.test.example'], now), checkout);
  for (const fields of [{ checkout_url: 'https://evil.test/checkout' }, { checkout_url: 'http://checkout.test.example/x' }, { session_id: '' }, { expires_at: 'invalid' }, { expires_at: now.toISOString() }]) {
    assert.throws(() => parseCheckoutSession({ ...valid, ...fields }, ['https://checkout.test.example'], now));
  }
});

const config = {
  apiBase: 'https://gateway.test.example/payg', adminToken: 'synthetic-test-token',
  fulfillUrl: 'https://movecar.test.example/api/payment/paibao/fulfill',
  successUrl: 'https://movecar.test.example/payment/order', cancelUrl: 'https://movecar.test.example/payment/order',
  timeoutMs: 1000, reconcileIntervalMs: 1000, environment: 'test', checkoutOrigins: ['https://checkout.test.example'],
};

test('the consumer sends only the server snapshot, and ambiguous results are not retried', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, `${config.apiBase}/stripe/checkout-external`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount_cents, snapshot.amountCents);
    assert.equal(body.mode, 'payment');
    assert.equal(body.product_id, planId);
    assert.equal(new URL(body.success_url).searchParams.get('order_id'), orderId);
    assert.equal(body.price_id, undefined);
    return new Response('upstream failed after creation', { status: 502 });
  };
  try {
    await assert.rejects(createGatewayCheckout(config, snapshot, orderId, 'test@example.invalid'), errorCode('checkout_result_unknown'));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('status reconciliation only returns status and rejects a different gateway order', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ order_id: checkout.gatewayOrderId, status: 'paid', secret: 'not forwarded' });
  try {
    assert.equal(await reconcileGatewayOrder(config, checkout.gatewayOrderId), 'paid');
    await assert.rejects(reconcileGatewayOrder(config, 'other'), errorCode('reconciliation_invalid'));
  } finally { globalThis.fetch = original; }
});

test('a delayed, valid payment can complete an expired order but a refunded order never reopens', () => {
  assert.equal(validateFulfillment(order({ status: 'expired' }), payload), 'deliver');
  assert.throws(() => validateFulfillment(order({ status: 'refunded' }), payload), errorCode('transaction_conflict'));
});
