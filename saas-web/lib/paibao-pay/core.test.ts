import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  applyFulfillment, centsToMoney, Fulfillment, FulfillmentRepository, fulfillmentScope, metadataOf, moneyToCents,
  parseFulfillment, PaymentError, PaymentOrder, PlanInput,
  reusableCheckout, snapshotPlan, validateFulfillment, verifySignature, WaffoFulfillment,
} from './core';
import { createGatewayCheckout, parseCheckoutSession, reconcileGatewayOrder } from './gateway';

const planId = '5c83c82b-37e8-406e-9f39-cafcab459e2d';
const orderId = '0bffde03-bb00-4d42-92d0-89259ff2aab6';
const now = new Date('2026-10-01T16:00:00Z');
const plan: PlanInput = {
  id: planId, environment: 'test', isActive: true, cardTitle: 'Lifetime', paymentType: 'one_time',
  recurringInterval: null, price: '29', currency: 'USD', benefitsJsonb: { movecarPlanType: 'lifetime' },
};
const stripeSelection = { channel: 'stripe', apiBase: 'https://gateway.test.example/payg', environment: 'test', productId: planId } as const;
const snapshot = snapshotPlan(plan, 'test', stripeSelection);
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
  assert.equal(centsToMoney(490), '4.90');
  assert.equal(centsToMoney(Number.MAX_SAFE_INTEGER), '90071992547409.91');
  for (const price of ['0', '-1', '1.001', '1e3', 'Infinity', '9007199254740992']) {
    assert.throws(() => moneyToCents(price));
  }
  for (const fields of [{ isActive: false }, { environment: 'live' }, { benefitsJsonb: {} }, { currency: 'JPY' }, { recurringInterval: 'month' }]) {
    assert.throws(() => snapshotPlan({ ...plan, ...fields }, 'test', stripeSelection));
  }
  assert.throws(() => snapshotPlan({ ...plan, paymentType: 'recurring' }, 'test', stripeSelection), errorCode('subscription_contract_missing'));
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
    async findTransaction(id, notification) {
      return rows.find(row => {
        const meta = metadataOf(row);
        return meta.transactionId === id && meta.snapshot.channel === notification.channel &&
          (notification.channel !== 'waffo' || meta.snapshot.gatewayEnvironment === notification.mode);
      });
    },
    async findGatewayTransactionOrder(id, notification) {
      return rows.find(row => {
        const meta = metadataOf(row);
        return meta.gatewayTransactionOrderId === id && meta.snapshot.channel === 'waffo' &&
          meta.snapshot.gatewayEnvironment === notification.mode;
      });
    },
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
  assert.deepEqual(calls.slice(0, 2), [`transaction:stripe:transaction:${payload.stripe_txn}`, `order:${orderId}`]);
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
  channel: 'stripe' as const, gatewayEnvironment: 'test' as const, products: undefined, taxCategory: undefined,
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
    await assert.rejects(createGatewayCheckout(config, snapshot, orderId, 'test@example.invalid', 'user-test'), errorCode('checkout_result_unknown'));
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

const waffoSku = 'PROD_0123456789abcdefghijkl';
const waffoSelection = { channel: 'waffo', apiBase: 'https://gateway.test.example/payw', environment: 'test', productId: waffoSku, taxCategory: 'saas' } as const;
const waffoSnapshot = snapshotPlan(plan, 'test', waffoSelection);
const waffoPayload: WaffoFulfillment = {
  ref: orderId, product_id: waffoSku, out_trade_no: checkout.gatewayOrderId,
  channel: 'waffo', event_type: 'order.completed', waffo_txn: 'PAY_TEST_001', waffo_order_id: 'ORDER_TEST_001',
  amount: '29.00', currency: 'USD', mode: 'test',
};
function waffoOrder(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return order({ productId: waffoSku, metadata: { snapshot: waffoSnapshot, checkoutState: 'ready', checkout }, ...overrides });
}

test('Waffo snapshots require a valid mapped SKU, explicit HTTPS routing and matching pricing mode', () => {
  assert.equal(waffoSnapshot.productId, waffoSku);
  assert.equal(waffoSnapshot.gatewayEnvironment, 'test');
  for (const fields of [{ productId: planId }, { productId: '' }, { environment: 'prod' as const }, { apiBase: 'http://invalid.example/payw' }, { taxCategory: '' }]) {
    assert.throws(() => snapshotPlan(plan, 'test', { ...waffoSelection, ...fields }));
  }
  const live = snapshotPlan({ ...plan, environment: 'live' }, 'live', { ...waffoSelection, environment: 'prod' });
  assert.equal(live.gatewayEnvironment, 'prod');
  assert.throws(() => snapshotPlan({ ...plan, environment: 'live' }, 'live', waffoSelection));
  // A pending checkout remains bound to its original channel when defaults change.
  assert.deepEqual(reusableCheckout(waffoOrder(), snapshot, now), checkout);
  assert.throws(() => metadataOf(waffoOrder({ metadata: { snapshot: { ...waffoSnapshot, gatewayEnvironment: 'prod' }, checkoutState: 'ready', checkout } })), errorCode('order_snapshot_invalid'));
});

test('Waffo parsing requires display-string amounts, actual transaction and provider order IDs, and a one-time completion', () => {
  assert.deepEqual(parseFulfillment(Buffer.from(JSON.stringify(waffoPayload))), waffoPayload);
  for (const fields of [{ amount: 29 }, { amount: '29.001' }, { amount: '0' }, { waffo_txn: '' }, { waffo_order_id: '' }, { mode: 'live' }, { event_type: 'subscription.activated' }, { product_id: planId }]) {
    assert.throws(() => parseFulfillment(Buffer.from(JSON.stringify({ ...waffoPayload, ...fields }))), errorCode('callback_invalid'));
  }
});

test('Waffo fulfillment binds the immutable SKU, quote, mode and both transaction identifiers', async () => {
  for (const fields of [{ mode: 'prod' as const }, { amount: '28.99' }, { currency: 'CNY' }, { product_id: 'PROD_abcdefghijkl0123456789' }, { out_trade_no: 'other' }]) {
    assert.throws(() => validateFulfillment(waffoOrder(), { ...waffoPayload, ...fields }), errorCode('payment_mismatch'));
  }
  assert.throws(() => validateFulfillment(order(), waffoPayload), errorCode('payment_mismatch'));
  const row = waffoOrder();
  const { repo, calls } = repository([row]);
  assert.equal(await applyFulfillment(repo, waffoPayload), 'delivered');
  assert.deepEqual(calls.slice(0, 3), ['transaction:waffo:test:transaction:PAY_TEST_001', 'transaction:waffo:test:order:ORDER_TEST_001', `order:${orderId}`]);
  assert.equal(metadataOf(row).gatewayTransactionOrderId, waffoPayload.waffo_order_id);
  assert.equal(await applyFulfillment(repo, waffoPayload), 'duplicate');
  await assert.rejects(applyFulfillment(repo, { ...waffoPayload, waffo_order_id: 'OTHER_ORDER' }), errorCode('payment_mismatch'));
  await assert.rejects(applyFulfillment(repo, { ...waffoPayload, waffo_txn: 'OTHER_PAYMENT' }), errorCode('transaction_conflict'));
});

test('Waffo prevents cross-order reuse of either actual transaction or provider order ID with scoped namespaces', async () => {
  const first = waffoOrder();
  await applyFulfillment(repository([first]).repo, waffoPayload);
  const secondId = planId;
  const second = waffoOrder({ id: secondId });
  const repo = repository([first, second]).repo;
  await assert.rejects(applyFulfillment(repo, { ...waffoPayload, ref: secondId }), errorCode('transaction_reused'));
  await assert.rejects(applyFulfillment(repo, { ...waffoPayload, ref: secondId, waffo_txn: 'OTHER_PAYMENT' }), errorCode('transaction_reused'));
  assert.equal(second.status, 'pending');
  assert.notEqual(fulfillmentScope(waffoPayload), fulfillmentScope({ ...waffoPayload, mode: 'prod' }));
});

test('Waffo checkout sends its immutable display quote, mapped SKU, buyer identity and disables trials', async () => {
  const waffoConfig = { ...config, channel: 'waffo' as const, apiBase: waffoSelection.apiBase, taxCategory: 'saas' };
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, `${waffoSelection.apiBase}/waffo/checkout-external`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.product_id, waffoSku);
    assert.equal(body.amount, '29.00');
    assert.equal(body.amount_cents, undefined);
    assert.equal(body.buyer_identity, 'user-test');
    assert.equal(body.with_trial, false);
    assert.equal(body.tax_category, waffoSnapshot.channel === 'waffo' ? waffoSnapshot.taxCategory : undefined);
    assert.equal(new URL(body.success_url).searchParams.get('order_id'), orderId);
    return Response.json({ order_id: checkout.gatewayOrderId, session_id: checkout.sessionId, checkout_url: checkout.checkoutUrl, expires_at: new Date(Date.now() + 10000).toISOString() });
  };
  try {
    assert.equal((await createGatewayCheckout(waffoConfig, waffoSnapshot, orderId, 'test@example.invalid', 'user-test')).gatewayOrderId, checkout.gatewayOrderId);
    await assert.rejects(reconcileGatewayOrder(waffoConfig, checkout.gatewayOrderId), errorCode('reconciliation_unsupported'));
    assert.equal(calls, 1);
    await assert.rejects(createGatewayCheckout(config, waffoSnapshot, orderId, 'test@example.invalid', 'user-test'), errorCode('configuration_invalid'));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('legacy Stripe routing snapshots remain readable without accepting partial or mismatched routing data', () => {
  const { gatewayApiBase: _base, gatewayEnvironment: _environment, ...legacy } = snapshot;
  assert.equal(metadataOf(order({ metadata: { snapshot: legacy, checkoutState: 'ready', checkout } })).snapshot.channel, 'stripe');
  assert.throws(() => metadataOf(order({ metadata: { snapshot: { ...legacy, gatewayEnvironment: 'test' }, checkoutState: 'ready', checkout } })), errorCode('order_snapshot_invalid'));
});
