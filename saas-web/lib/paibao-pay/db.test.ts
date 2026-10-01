import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { metadataOf } from './core';

test('Waffo database reservations, channel snapshots and signed deliveries remain isolated and idempotent', {
  skip: !process.env.MOVECAR_PAYMENT_TEST_DATABASE_URL,
}, async () => {
  const databaseUrl = process.env.MOVECAR_PAYMENT_TEST_DATABASE_URL!;
  const database = new URL(databaseUrl);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/movecar_launch_test');
  assert.equal(database.password, '');
  const fixtureSecret = 'synthetic-waffo-fixture-secret';
  const fixtureSku = 'PROD_0123456789abcdefghijkl';
  const env = {
    DATABASE_URL: databaseUrl, NODE_ENV: 'test', PRICING_ENVIRONMENT: 'test',
    NEXT_PUBLIC_SITE_URL: 'https://movecar.fixture.invalid',
    PAY_CHECKOUT_CHANNEL: 'waffo', PAY_WAFFO_API_BASE: 'https://gateway.fixture.invalid/payw',
    PAY_API_BASE: 'https://gateway.fixture.invalid/payg', WAFFO_ENV: 'test', WAFFO_TAX_CATEGORY: 'saas',
    WAFFO_PRODUCT_MAP: '{}', PAY_ADMIN_TOKEN: 'synthetic-waffo-fixture-token',
    PAIBAO_FULFILL_HMAC_SECRET: fixtureSecret, PAY_CHECKOUT_TIMEOUT_MS: '1000',
    PAY_RECONCILE_MIN_INTERVAL_MS: '1000', PAY_CHECKOUT_ALLOWED_ORIGINS: '["https://checkout.fixture.invalid"]',
    PAY_FULFILL_URL: 'https://movecar.fixture.invalid/api/payment/paibao/fulfill',
    PAY_SUCCESS_URL: 'https://movecar.fixture.invalid/payment/order', PAY_CANCEL_URL: 'https://movecar.fixture.invalid/payment/order',
  };
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const { db } = await import('@/lib/db');
  const { user, pricingPlans, orders } = await import('@/lib/db/schema');
  const { checkoutPlan, getPaymentOrder } = await import('./service');
  const { resolveMovecarPlan } = await import('@/lib/movecar/plan');
  const { POST } = await import('@/app/api/payment/paibao/fulfill/route');
  const users: string[] = [];
  let fixturePlanId: string | undefined;
  const originalFetch = globalThis.fetch;
  try {
    const [source] = await db.select().from(pricingPlans).limit(1);
    assert.ok(source, 'Test database must contain its isolated pricing group fixture.');
    const [plan] = await db.insert(pricingPlans).values({
      environment: 'test', groupSlug: source.groupSlug, cardTitle: 'waffo-test Lifetime',
      provider: 'none', paymentType: 'one_time', recurringInterval: null,
      price: '29.00', currency: 'USD', isActive: true, benefitsJsonb: { movecarPlanType: 'lifetime' },
    }).returning();
    fixturePlanId = plan.id;
    process.env.WAFFO_PRODUCT_MAP = JSON.stringify({ [plan.id]: fixtureSku });
    const buyer = async (name: string) => {
      const [row] = await db.insert(user).values({
        id: randomUUID(), name: `waffo-test ${name}`, email: `${randomUUID()}@fixture.invalid`,
      }).returning();
      users.push(row.id);
      return row;
    };
    let calls = 0;
    let failCreation = false;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://gateway.fixture.invalid');
      assert.equal(url.pathname, '/payw/waffo/checkout-external');
      calls++;
      const request = JSON.parse(String(init?.body));
      assert.equal(request.product_id, fixtureSku);
      assert.equal(request.amount, '29.00');
      assert.equal(request.with_trial, false);
      assert.ok(users.includes(request.buyer_identity));
      const [persisted] = await db.select().from(orders).where(eq(orders.id, request.ref));
      assert.equal(persisted.status, 'pending');
      assert.equal(metadataOf(persisted).checkoutState, 'creating');
      if (failCreation) throw new Error('Synthetic connection loss after provider creation.');
      return Response.json({
        order_id: `pw-${request.ref}`, session_id: `session-${request.ref}`,
        checkout_url: `https://checkout.fixture.invalid/${request.ref}`,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });
    };
    const firstBuyer = await buyer('first');
    const first = await checkoutPlan(firstBuyer.id, firstBuyer.email, plan.id);
    const reused = await checkoutPlan(firstBuyer.id, firstBuyer.email, plan.id);
    assert.equal(first.orderId, reused.orderId);
    assert.equal(calls, 1);
    const [firstRow] = await db.select().from(orders).where(eq(orders.id, first.orderId));
    assert.equal(metadataOf(firstRow).snapshot.channel, 'waffo');
    assert.equal(firstRow.productId, fixtureSku);
    Object.assign(process.env, { PAY_CHECKOUT_CHANNEL: 'stripe', WAFFO_ENV: '', WAFFO_PRODUCT_MAP: '' });
    assert.equal((await checkoutPlan(firstBuyer.id, firstBuyer.email, plan.id)).checkoutUrl, first.checkoutUrl);
    assert.equal((await getPaymentOrder(firstBuyer.id, first.orderId)).status, 'pending');
    assert.equal(calls, 1);
    assert.equal((await resolveMovecarPlan(firstBuyer.id)).plan, 'free');
    await assert.rejects(getPaymentOrder(randomUUID(), first.orderId), { code: 'order_not_found' });
    Object.assign(process.env, { PAY_CHECKOUT_CHANNEL: 'waffo', WAFFO_ENV: 'test', WAFFO_PRODUCT_MAP: JSON.stringify({ [plan.id]: fixtureSku }) });
    const payload = {
      ref: first.orderId, product_id: fixtureSku, out_trade_no: `pw-${first.orderId}`,
      channel: 'waffo', event_type: 'order.completed', mode: 'test',
      amount: '29.00', currency: 'USD', waffo_txn: `payment-${randomUUID()}`, waffo_order_id: `order-${randomUUID()}`,
    };
    const invoke = async (body: unknown, signed = true) => {
      const raw = JSON.stringify(body);
      const headers: Record<string, string> = {};
      if (signed) headers['X-Paibao-Signature'] = createHmac('sha256', fixtureSecret).update(raw).digest('hex');
      return POST(new Request(env.PAY_FULFILL_URL, { method: 'POST', headers, body: raw }));
    };
    assert.equal((await invoke(payload, false)).status, 401);
    assert.equal((await invoke({ ...payload, mode: 'prod' })).status, 409);
    assert.equal((await invoke({ ...payload, amount: '28.99' })).status, 409);
    assert.equal((await resolveMovecarPlan(firstBuyer.id)).plan, 'free');
    const completed = await Promise.all([invoke(payload), invoke(payload)]);
    assert.ok(completed.every(response => response.status === 200));
    const results = await Promise.all(completed.map(response => response.json()));
    assert.deepEqual(new Set(results.map(result => result.result)), new Set(['delivered', 'duplicate']));
    assert.equal((await resolveMovecarPlan(firstBuyer.id)).plan, 'lifetime');
    assert.equal((await invoke({ ...payload, waffo_order_id: 'different-provider-order' })).status, 409);
    await assert.rejects(checkoutPlan(firstBuyer.id, firstBuyer.email, plan.id), { code: 'already_purchased' });
    const secondBuyer = await buyer('second');
    const second = await checkoutPlan(secondBuyer.id, secondBuyer.email, plan.id);
    const crossOrder = { ...payload, ref: second.orderId, out_trade_no: `pw-${second.orderId}` };
    assert.equal((await invoke(crossOrder)).status, 409);
    assert.equal((await invoke({ ...crossOrder, waffo_txn: 'different-transaction' })).status, 409);
    assert.equal((await resolveMovecarPlan(secondBuyer.id)).plan, 'free');
    const unmappedBuyer = await buyer('unmapped');
    process.env.WAFFO_PRODUCT_MAP = '{}';
    const beforeMissing = calls;
    await assert.rejects(checkoutPlan(unmappedBuyer.id, unmappedBuyer.email, plan.id), { code: 'product_mapping_missing' });
    assert.equal(calls, beforeMissing);
    assert.equal((await db.select().from(orders).where(eq(orders.userId, unmappedBuyer.id))).length, 0);
    process.env.WAFFO_PRODUCT_MAP = JSON.stringify({ [plan.id]: fixtureSku });
    const unknownBuyer = await buyer('unknown');
    failCreation = true;
    await assert.rejects(checkoutPlan(unknownBuyer.id, unknownBuyer.email, plan.id), { code: 'checkout_result_unknown' });
    const beforeRetry = calls;
    await assert.rejects(checkoutPlan(unknownBuyer.id, unknownBuyer.email, plan.id), { code: 'checkout_pending_review' });
    assert.equal(calls, beforeRetry);
    const [unknown] = await db.select().from(orders).where(eq(orders.userId, unknownBuyer.id));
    assert.equal(metadataOf(unknown).checkoutState, 'unknown');
  } finally {
    globalThis.fetch = originalFetch;
    if (users.length) await db.delete(user).where(inArray(user.id, users));
    if (fixturePlanId) await db.delete(pricingPlans).where(eq(pricingPlans.id, fixturePlanId));
    await db.$client.end();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
