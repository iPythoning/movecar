import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatewaySelection, paymentConfig } from './config';
import { PaymentError, snapshotPlan } from './core';

const planId = '5c83c82b-37e8-406e-9f39-cafcab459e2d';
const sku = 'PROD_0123456789abcdefghijkl';
const env = {
  NODE_ENV: 'test', NEXT_PUBLIC_SITE_URL: 'https://movecar.test.example',
  PAY_CHECKOUT_CHANNEL: 'waffo', PAY_API_BASE: 'https://gateway.test.example/payg',
  PAY_WAFFO_API_BASE: 'https://gateway.test.example/payw',
  PAY_ADMIN_TOKEN: 'synthetic-test-token', PAIBAO_FULFILL_HMAC_SECRET: 'synthetic-test-secret',
  WAFFO_ENV: 'test', WAFFO_PRODUCT_MAP: JSON.stringify({ [planId]: sku }), WAFFO_TAX_CATEGORY: 'saas',
  PRICING_ENVIRONMENT: 'test', PAY_CHECKOUT_TIMEOUT_MS: '1000', PAY_RECONCILE_MIN_INTERVAL_MS: '1000',
  PAY_CHECKOUT_ALLOWED_ORIGINS: JSON.stringify(['https://checkout.test.example']),
  PAY_FULFILL_URL: 'https://movecar.test.example/api/payment/paibao/fulfill',
  PAY_SUCCESS_URL: 'https://movecar.test.example/payment/order', PAY_CANCEL_URL: 'https://movecar.test.example/payment/order',
};
function withEnv(overrides: Partial<typeof env>, run: () => void) {
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env, overrides);
  try { run(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const paymentError = (code: string) => (error: unknown) => error instanceof PaymentError && error.code === code;

test('checkout routing is explicit, missing Waffo mappings never fall back to Stripe', () => {
  withEnv({}, () => {
    const config = paymentConfig();
    assert.equal(config.channel, 'waffo');
    assert.equal(config.apiBase, env.PAY_WAFFO_API_BASE);
    assert.equal(gatewaySelection(config, planId).productId, sku);
    assert.throws(() => gatewaySelection(config, 'not-mapped'), paymentError('product_mapping_missing'));
  });
  for (const overrides of [{ PAY_CHECKOUT_CHANNEL: '' }, { PAY_CHECKOUT_CHANNEL: 'auto' }, { PAY_WAFFO_API_BASE: '' }, { WAFFO_TAX_CATEGORY: '' }]) {
    withEnv(overrides, () => assert.throws(() => paymentConfig()));
  }
  for (const map of ['', '{}', JSON.stringify({ [planId]: planId }), JSON.stringify({ [planId]: sku, ['invalid']: sku })]) {
    withEnv({ WAFFO_PRODUCT_MAP: map }, () => assert.throws(() => paymentConfig(), paymentError('product_mapping_missing')));
  }
});

test('new Waffo mode must match the active pricing environment and runtime', () => {
  withEnv({ WAFFO_ENV: 'prod' }, () => assert.throws(() => paymentConfig(), paymentError('configuration_invalid')));
  withEnv({ NODE_ENV: 'production', PRICING_ENVIRONMENT: 'live', WAFFO_ENV: 'prod' }, () => {
    assert.equal(paymentConfig().gatewayEnvironment, 'prod');
  });
  withEnv({ NODE_ENV: 'production', PRICING_ENVIRONMENT: 'live', WAFFO_ENV: 'test' }, () => {
    assert.throws(() => paymentConfig(), paymentError('configuration_invalid'));
  });
});

test('old order routing remains bound to its channel, API base and mode when defaults change', () => {
  withEnv({}, () => {
    const stripe = snapshotPlan({
      id: planId, environment: 'test', isActive: true, cardTitle: 'Lifetime', paymentType: 'one_time',
      recurringInterval: null, price: '29', currency: 'USD', benefitsJsonb: { movecarPlanType: 'lifetime' },
    }, 'test', { channel: 'stripe', apiBase: env.PAY_API_BASE, environment: 'test', productId: planId });
    withEnv({ PAY_CHECKOUT_CHANNEL: 'waffo', PAY_API_BASE: 'https://new-gateway.test.example/payg', WAFFO_ENV: '', WAFFO_PRODUCT_MAP: '' }, () => {
      const storedConfig = paymentConfig(stripe);
      assert.equal(storedConfig.channel, 'stripe');
      assert.equal(storedConfig.apiBase, env.PAY_API_BASE);
      assert.equal(storedConfig.gatewayEnvironment, 'test');
    });
  });
});

test('new checkouts require a fulfillment secret for either payment channel', () => {
  for (const channel of ['stripe', 'waffo']) {
    for (const secret of [undefined, '', '   ']) {
      withEnv({ PAY_CHECKOUT_CHANNEL: channel }, () => {
        if (secret === undefined) delete process.env.PAIBAO_FULFILL_HMAC_SECRET;
        else process.env.PAIBAO_FULFILL_HMAC_SECRET = secret;
        assert.throws(() => paymentConfig(), error =>
          error instanceof PaymentError && error.code === 'configuration_missing' && error.status === 503);
      });
    }
  }
});

test('stored checkout snapshots still require the current fulfillment secret', () => {
  const plan = {
    id: planId, environment: 'test', isActive: true, cardTitle: 'Lifetime', paymentType: 'one_time',
    recurringInterval: null, price: '29', currency: 'USD', benefitsJsonb: { movecarPlanType: 'lifetime' },
  };
  const stripe = snapshotPlan(plan, 'test', {
    channel: 'stripe', apiBase: env.PAY_API_BASE, environment: 'test', productId: planId,
  });
  assert.ok(stripe.channel === 'stripe');
  const legacyStripe = { ...stripe, gatewayApiBase: undefined, gatewayEnvironment: undefined };
  const waffo = snapshotPlan(plan, 'test', {
    channel: 'waffo', apiBase: env.PAY_WAFFO_API_BASE, environment: 'test', productId: sku, taxCategory: 'saas',
  });
  withEnv({ PAY_CHECKOUT_CHANNEL: '', WAFFO_ENV: '', WAFFO_PRODUCT_MAP: '' }, () => {
    for (const snapshot of [stripe, legacyStripe, waffo]) {
      assert.equal(paymentConfig(snapshot).channel, snapshot.channel);
    }
    delete process.env.PAIBAO_FULFILL_HMAC_SECRET;
    for (const snapshot of [stripe, legacyStripe, waffo]) {
      assert.throws(() => paymentConfig(snapshot), error =>
        error instanceof PaymentError && error.code === 'configuration_missing' && error.status === 503);
    }
  });
});
