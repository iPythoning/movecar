import 'server-only';
import { CheckoutChannel, GatewaySelection, PaymentError, PlanSnapshot } from './core';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new PaymentError('configuration_missing', 503, 'Payment is temporarily unavailable.');
  return value;
}

function secureUrl(name: string): URL {
  try {
    const url = new URL(required(name));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid URL');
    return url;
  } catch {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
}

export function fulfillSecret(): string {
  return required('PAIBAO_FULFILL_HMAC_SECRET');
}

export function pricingEnvironment(): 'live' | 'test' {
  const environment = required('PRICING_ENVIRONMENT');
  const renderedEnvironment = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  if (!['live', 'test'].includes(environment) || environment !== renderedEnvironment) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  return environment as 'live' | 'test';
}

function waffoProducts(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(required('WAFFO_PRODUCT_MAP'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid map');
    const entries = Object.entries(value);
    if (!entries.length || entries.some(([id, sku]) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      typeof sku !== 'string' || !/^PROD_[0-9A-Za-z]{22}$/.test(sku)) ||
      new Set(entries.map(([, sku]) => sku)).size !== entries.length) throw new Error('Invalid map');
    return value as Record<string, string>;
  } catch {
    throw new PaymentError('product_mapping_missing', 503, 'Payment is temporarily unavailable.');
  }
}

export function paymentConfig(snapshot?: PlanSnapshot) {
  const channel = snapshot?.channel ?? required('PAY_CHECKOUT_CHANNEL');
  if (!['stripe', 'waffo'].includes(channel)) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  const environment = snapshot?.environment ?? pricingEnvironment();
  const gatewayEnvironment = snapshot?.gatewayEnvironment ??
    (channel === 'waffo' ? required('WAFFO_ENV') : environment);
  const expectedMode = channel === 'waffo' && environment === 'live' ? 'prod' : environment;
  if (gatewayEnvironment !== expectedMode) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  const base = snapshot?.gatewayApiBase ? new URL(snapshot.gatewayApiBase) :
    secureUrl(channel === 'waffo' ? 'PAY_WAFFO_API_BASE' : 'PAY_API_BASE');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  const site = secureUrl('NEXT_PUBLIC_SITE_URL');
  const fulfillUrl = secureUrl('PAY_FULFILL_URL');
  const successUrl = secureUrl('PAY_SUCCESS_URL');
  const cancelUrl = secureUrl('PAY_CANCEL_URL');
  if ([fulfillUrl, successUrl, cancelUrl].some(url => url.origin !== site.origin)) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  const timeoutMs = Number(required('PAY_CHECKOUT_TIMEOUT_MS'));
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  const reconcileIntervalMs = Number(required('PAY_RECONCILE_MIN_INTERVAL_MS'));
  if (!Number.isSafeInteger(reconcileIntervalMs) || reconcileIntervalMs < timeoutMs) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  let checkoutOrigins: string[];
  try {
    const value: unknown = JSON.parse(required('PAY_CHECKOUT_ALLOWED_ORIGINS'));
    if (!Array.isArray(value) || !value.length || value.some(item => {
      if (typeof item !== 'string') return true;
      const url = new URL(item);
      return url.protocol !== 'https:' || url.origin !== item;
    })) throw new Error('Invalid origins');
    checkoutOrigins = value;
  } catch {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  return {
    apiBase: base.href.replace(/\/$/, ''), adminToken: required('PAY_ADMIN_TOKEN'),
    fulfillUrl: fulfillUrl.href, successUrl: successUrl.href, cancelUrl: cancelUrl.href,
    timeoutMs, reconcileIntervalMs, environment, checkoutOrigins,
    channel: channel as CheckoutChannel, gatewayEnvironment: gatewayEnvironment as GatewaySelection['environment'],
    products: channel === 'waffo' && !snapshot ? waffoProducts() : undefined,
    taxCategory: channel === 'waffo' ? snapshot?.channel === 'waffo' ? snapshot.taxCategory : required('WAFFO_TAX_CATEGORY') : undefined,
  };
}

export function gatewaySelection(config: PaymentConfig, planId: string): GatewaySelection {
  const productId = config.channel === 'waffo' ? config.products?.[planId] : planId;
  if (!productId) throw new PaymentError('product_mapping_missing', 503, 'Payment is temporarily unavailable.');
  return { channel: config.channel, apiBase: config.apiBase, environment: config.gatewayEnvironment, productId, taxCategory: config.taxCategory };
}

export type PaymentConfig = ReturnType<typeof paymentConfig>;
