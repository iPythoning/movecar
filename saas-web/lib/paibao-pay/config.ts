import 'server-only';
import { PaymentError } from './core';

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

export function paymentConfig() {
  const base = secureUrl('PAY_API_BASE');
  if (base.search) throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
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
  const environment = required('PRICING_ENVIRONMENT');
  const renderedEnvironment = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  if (!['live', 'test'].includes(environment) || environment !== renderedEnvironment) {
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
  };
}

export type PaymentConfig = ReturnType<typeof paymentConfig>;
