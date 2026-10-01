import { createHmac, timingSafeEqual } from 'node:crypto';

export class PaymentError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string, public readonly orderId?: string) {
    super(message);
  }
}

export type PlanInput = {
  id: string; environment: string; isActive: boolean; cardTitle: string;
  paymentType: string | null; recurringInterval: string | null;
  price: string | null; currency: string | null; benefitsJsonb: unknown;
};
export type PlanSnapshot = {
  planId: string; environment: string; productId: string; title: string;
  planType: 'lifetime'; channel: 'stripe'; amountCents: number; currency: string;
};
export type CheckoutSession = {
  gatewayOrderId: string; sessionId: string; checkoutUrl: string; expiresAt: string;
};
export type PaymentMetadata = {
  snapshot: PlanSnapshot; checkoutState: 'creating' | 'ready' | 'unknown';
  checkout?: CheckoutSession; transactionId?: string; eventType?: string;
  lastReconciledAt?: string;
};
export type PaymentOrder = {
  id: string; userId: string; provider: string; providerOrderId: string;
  orderType: string; status: string; planId: string | null; productId: string | null;
  amountTotal: string; currency: string; metadata: unknown;
};

const unavailable = () => new PaymentError('plan_unavailable', 400, 'This plan is unavailable for checkout.');

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}

export function moneyToCents(price: unknown): number {
  if (typeof price !== 'string' || !/^\d+(?:\.\d{1,2}0*)?$/.test(price)) throw unavailable();
  const [whole, fraction = ''] = price.split('.');
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw unavailable();
  return cents;
}

export function snapshotPlan(plan: PlanInput, environment: string): PlanSnapshot {
  if (!plan.isActive || plan.environment !== environment) throw unavailable();
  if (plan.paymentType === 'recurring') {
    throw new PaymentError('subscription_contract_missing', 409, 'Subscriptions are temporarily unavailable. Please choose Lifetime.');
  }
  const benefits = record(plan.benefitsJsonb);
  const currency = plan.currency?.toUpperCase();
  // The amount_cents contract supports two-decimal currencies. Currency facts
  // come from the runtime's ISO data rather than a mutable business allowlist.
  const centsCurrency = currency && Intl.supportedValuesOf('currency').includes(currency) &&
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits === 2;
  if (!['one_time', 'onetime'].includes(plan.paymentType ?? '') ||
      (plan.recurringInterval !== null && plan.recurringInterval !== 'once') ||
      benefits.movecarPlanType !== 'lifetime' || !plan.cardTitle.trim() ||
      !currency || !centsCurrency) throw unavailable();
  return {
    planId: plan.id, environment: plan.environment, productId: plan.id,
    title: plan.cardTitle, planType: 'lifetime', channel: 'stripe',
    amountCents: moneyToCents(plan.price), currency,
  };
}

export function metadataOf(order: PaymentOrder): PaymentMetadata {
  const meta = record(order.metadata);
  const snapshot = record(meta.snapshot);
  if (snapshot.planId !== order.planId || snapshot.productId !== order.productId ||
      snapshot.planType !== 'lifetime' || snapshot.channel !== 'stripe' ||
      snapshot.amountCents !== moneyToCents(order.amountTotal) || snapshot.currency !== order.currency ||
      typeof snapshot.environment !== 'string' || typeof snapshot.title !== 'string' ||
      !['creating', 'ready', 'unknown'].includes(String(meta.checkoutState))) {
    throw new PaymentError('order_snapshot_invalid', 409, 'This order needs review before it can be completed.', order.id);
  }
  return meta as unknown as PaymentMetadata;
}

export function reusableCheckout(order: PaymentOrder, snapshot: PlanSnapshot, now: Date): CheckoutSession {
  const meta = metadataOf(order);
  if (meta.snapshot.amountCents !== snapshot.amountCents || meta.snapshot.currency !== snapshot.currency ||
      meta.snapshot.environment !== snapshot.environment || meta.checkoutState !== 'ready' || !meta.checkout ||
      Date.parse(meta.checkout.expiresAt) <= now.getTime()) {
    throw new PaymentError('checkout_pending_review', 409, 'An existing checkout is still being checked. Check its status before trying again.', order.id);
  }
  return meta.checkout;
}

export function verifySignature(raw: Uint8Array, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export type Fulfillment = {
  ref: string; product_id: string; out_trade_no: string; channel: 'stripe';
  event_type: 'checkout.session.completed'; stripe_txn: string; amount_cents: number; currency: string;
};

export function parseFulfillment(raw: Uint8Array): Fulfillment {
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(Buffer.from(raw).toString('utf8'))); }
  catch { throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.'); }
  if (typeof body.ref !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.ref) ||
      typeof body.product_id !== 'string' || !body.product_id ||
      typeof body.out_trade_no !== 'string' || !body.out_trade_no ||
      body.channel !== 'stripe' || body.event_type !== 'checkout.session.completed' ||
      typeof body.stripe_txn !== 'string' || !body.stripe_txn.trim() ||
      !Number.isSafeInteger(body.amount_cents) || Number(body.amount_cents) <= 0 ||
      typeof body.currency !== 'string' || !body.currency) {
    throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.');
  }
  return body as unknown as Fulfillment;
}

export function validateFulfillment(order: PaymentOrder, payload: Fulfillment): 'deliver' | 'duplicate' {
  const meta = metadataOf(order);
  const snapshot = meta.snapshot;
  if (!meta.checkout || meta.checkoutState !== 'ready') {
    throw new PaymentError('checkout_not_saved', 503, 'Payment confirmation is still being prepared.', order.id);
  }
  if (order.provider !== 'paibao' || order.orderType !== 'one_time_purchase' || payload.ref !== order.id ||
      payload.product_id !== snapshot.productId || payload.out_trade_no !== order.providerOrderId ||
      payload.out_trade_no !== meta.checkout.gatewayOrderId || payload.channel !== snapshot.channel ||
      payload.event_type !== 'checkout.session.completed' || payload.amount_cents !== snapshot.amountCents ||
      payload.currency.toUpperCase() !== snapshot.currency) {
    throw new PaymentError('payment_mismatch', 409, 'Payment details do not match this order.', order.id);
  }
  if (order.status === 'succeeded' && meta.transactionId === payload.stripe_txn) return 'duplicate';
  if (meta.transactionId || !['pending', 'expired'].includes(order.status)) {
    throw new PaymentError('transaction_conflict', 409, 'This payment needs review.', order.id);
  }
  return 'deliver';
}

export interface FulfillmentRepository {
  lockTransaction(transactionId: string): Promise<void>;
  lockOrder(id: string): Promise<PaymentOrder | undefined>;
  findTransaction(transactionId: string): Promise<PaymentOrder | undefined>;
  planType(planId: string): Promise<string | undefined>;
  succeed(order: PaymentOrder, metadata: PaymentMetadata): Promise<void>;
}

// The repository is supplied by a single database transaction. No entitlement is
// granted until every immutable snapshot and transaction binding has been checked.
export async function applyFulfillment(repository: FulfillmentRepository, payload: Fulfillment): Promise<'delivered' | 'duplicate'> {
  await repository.lockTransaction(payload.stripe_txn);
  const order = await repository.lockOrder(payload.ref);
  if (!order) throw new PaymentError('order_not_found', 404, 'Order not found.');
  const action = validateFulfillment(order, payload);
  const bound = await repository.findTransaction(payload.stripe_txn);
  if (bound && bound.id !== order.id) throw new PaymentError('transaction_reused', 409, 'This payment is already assigned to another order.', order.id);
  if (action === 'duplicate') return 'duplicate';
  if (!order.planId || await repository.planType(order.planId) !== 'lifetime') {
    throw new PaymentError('plan_changed', 409, 'The purchased plan needs review.', order.id);
  }
  await repository.succeed(order, {
    ...metadataOf(order), transactionId: payload.stripe_txn, eventType: payload.event_type,
  });
  return 'delivered';
}
