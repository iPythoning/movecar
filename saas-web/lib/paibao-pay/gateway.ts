import { CheckoutSession, PaymentError, PlanSnapshot, record } from './core';
import type { PaymentConfig } from './config';

export function returnUrl(base: string, orderId: string): string {
  const url = new URL(base);
  url.searchParams.set('order_id', orderId);
  return url.href;
}

export function parseCheckoutSession(value: unknown, allowedOrigins: string[], now: Date): CheckoutSession {
  const body = record(value);
  if (typeof body.order_id !== 'string' || !body.order_id.trim() ||
      typeof body.session_id !== 'string' || !body.session_id.trim() ||
      typeof body.checkout_url !== 'string' || typeof body.expires_at !== 'string') {
    throw new PaymentError('checkout_response_invalid', 503, 'Checkout could not be confirmed.');
  }
  const url = new URL(body.checkout_url);
  if (url.protocol !== 'https:' || url.username || url.password || !allowedOrigins.includes(url.origin) ||
      !Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= now.getTime()) {
    throw new PaymentError('checkout_response_invalid', 503, 'Checkout could not be confirmed.');
  }
  return {
    gatewayOrderId: body.order_id, sessionId: body.session_id,
    checkoutUrl: url.href, expiresAt: body.expires_at,
  };
}

export async function createGatewayCheckout(config: PaymentConfig, snapshot: PlanSnapshot, orderId: string, buyerEmail: string): Promise<CheckoutSession> {
  const response = await fetch(`${config.apiBase}/stripe/checkout-external`, {
    method: 'POST', cache: 'no-store', redirect: 'error',
    headers: { 'Authorization': `Bearer ${config.adminToken}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      ref: orderId, product_id: snapshot.productId, fulfill_url: config.fulfillUrl,
      amount_cents: snapshot.amountCents, currency: snapshot.currency, subject: snapshot.title,
      quantity: 1, mode: 'payment', buyer_email: buyerEmail,
      success_url: returnUrl(config.successUrl, orderId), cancel_url: returnUrl(config.cancelUrl, orderId),
    }),
  });
  // Any non-confirmed result is ambiguous: even a 5xx may follow a successful
  // downstream session creation. The caller retains the local pending order.
  if (!response.ok) throw new PaymentError('checkout_result_unknown', 503, 'Checkout could not be confirmed.');
  return parseCheckoutSession(await response.json(), config.checkoutOrigins, new Date());
}

export async function reconcileGatewayOrder(config: PaymentConfig, gatewayOrderId: string): Promise<'pending' | 'paid' | 'fulfilled' | 'expired'> {
  const response = await fetch(`${config.apiBase}/order/${encodeURIComponent(gatewayOrderId)}/status`, {
    method: 'GET', cache: 'no-store', redirect: 'error',
    headers: { 'Authorization': `Bearer ${config.adminToken}` }, signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new PaymentError('reconciliation_unavailable', 503, 'Payment confirmation is temporarily unavailable. Please check again.');
  const body = record(await response.json());
  if (body.order_id !== gatewayOrderId || !['pending', 'paid', 'fulfilled', 'expired'].includes(String(body.status))) {
    throw new PaymentError('reconciliation_invalid', 503, 'Payment confirmation is temporarily unavailable. Please check again.');
  }
  return body.status as 'pending' | 'paid' | 'fulfilled' | 'expired';
}
