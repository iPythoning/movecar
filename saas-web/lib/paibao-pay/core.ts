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
export type CheckoutChannel = 'stripe' | 'waffo';
export type PlanQuote = {
  planId: string; environment: string; title: string;
  planType: 'lifetime'; amountCents: number; currency: string;
};
export type GatewaySelection = {
  channel: CheckoutChannel; apiBase: string; environment: 'live' | 'test' | 'prod'; productId: string;
  taxCategory?: string;
};
export type PlanSnapshot = PlanQuote & { productId: string } & (
  // Existing Stripe reservations predate gateway routing snapshots.
  { channel: 'stripe'; gatewayApiBase?: string; gatewayEnvironment?: 'live' | 'test' } |
  { channel: 'waffo'; gatewayApiBase: string; gatewayEnvironment: 'prod' | 'test'; taxCategory: string }
);
export type CheckoutSession = {
  gatewayOrderId: string; sessionId: string; checkoutUrl: string; expiresAt: string;
};
export type PaymentMetadata = {
  snapshot: PlanSnapshot; checkoutState: 'creating' | 'ready' | 'unknown';
  checkout?: CheckoutSession; transactionId?: string; eventType?: string;
  lastReconciledAt?: string; gatewayTransactionOrderId?: string;
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

export function centsToMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw unavailable();
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function quotePlan(plan: PlanInput, environment: string): PlanQuote {
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
    planId: plan.id, environment: plan.environment,
    title: plan.cardTitle, planType: 'lifetime',
    amountCents: moneyToCents(plan.price), currency,
  };
}

function validGatewayBase(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function snapshotPlan(plan: PlanInput, environment: string, gateway: GatewaySelection): PlanSnapshot {
  const quote = quotePlan(plan, environment);
  const expectedMode = gateway.channel === 'waffo' && environment === 'live' ? 'prod' : environment;
  if (!validGatewayBase(gateway.apiBase) || gateway.environment !== expectedMode) {
    throw new PaymentError('configuration_invalid', 503, 'Payment is temporarily unavailable.');
  }
  if (gateway.channel === 'waffo') {
    if (!/^PROD_[0-9A-Za-z]{22}$/.test(gateway.productId) || !gateway.taxCategory?.trim()) {
      throw new PaymentError('product_mapping_missing', 503, 'Payment is temporarily unavailable.');
    }
    return { ...quote, channel: 'waffo', productId: gateway.productId,
      gatewayApiBase: gateway.apiBase, gatewayEnvironment: gateway.environment as 'prod' | 'test', taxCategory: gateway.taxCategory };
  }
  if (gateway.channel !== 'stripe' || gateway.productId !== plan.id) throw unavailable();
  return { ...quote, channel: 'stripe', productId: gateway.productId,
    gatewayApiBase: gateway.apiBase, gatewayEnvironment: gateway.environment as 'live' | 'test' };
}

export function metadataOf(order: PaymentOrder): PaymentMetadata {
  const meta = record(order.metadata);
  const snapshot = record(meta.snapshot);
  if (snapshot.planId !== order.planId || snapshot.productId !== order.productId ||
      snapshot.planType !== 'lifetime' || !['stripe', 'waffo'].includes(String(snapshot.channel)) ||
      snapshot.amountCents !== moneyToCents(order.amountTotal) || snapshot.currency !== order.currency ||
      !['live', 'test'].includes(String(snapshot.environment)) || typeof snapshot.title !== 'string' ||
      !['creating', 'ready', 'unknown'].includes(String(meta.checkoutState))) {
    throw new PaymentError('order_snapshot_invalid', 409, 'This order needs review before it can be completed.', order.id);
  }
  const hasRouting = snapshot.gatewayApiBase !== undefined || snapshot.gatewayEnvironment !== undefined;
  const expectedMode = snapshot.channel === 'waffo' && snapshot.environment === 'live' ? 'prod' : snapshot.environment;
  if (((snapshot.channel === 'waffo' || hasRouting) &&
       (!validGatewayBase(snapshot.gatewayApiBase) || snapshot.gatewayEnvironment !== expectedMode)) ||
      (snapshot.channel === 'waffo' && (!/^PROD_[0-9A-Za-z]{22}$/.test(String(snapshot.productId)) ||
       typeof snapshot.taxCategory !== 'string' || !snapshot.taxCategory.trim())) ||
      (meta.gatewayTransactionOrderId !== undefined &&
       (snapshot.channel !== 'waffo' || typeof meta.gatewayTransactionOrderId !== 'string' || !meta.gatewayTransactionOrderId.trim()))) {
    throw new PaymentError('order_snapshot_invalid', 409, 'This order needs review before it can be completed.', order.id);
  }
  return meta as unknown as PaymentMetadata;
}

export function reusableCheckout(order: PaymentOrder, snapshot: PlanQuote, now: Date): CheckoutSession {
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

export type StripeFulfillment = {
  ref: string; product_id: string; out_trade_no: string; channel: 'stripe';
  event_type: 'checkout.session.completed'; stripe_txn: string; amount_cents: number; currency: string;
};
export type WaffoFulfillment = {
  ref: string; product_id: string; out_trade_no: string; channel: 'waffo';
  event_type: 'order.completed'; waffo_txn: string; waffo_order_id: string;
  amount: string; currency: string; mode: 'prod' | 'test';
};
export type Fulfillment = StripeFulfillment | WaffoFulfillment;

export function fulfillmentTransaction(payload: Fulfillment): string {
  return payload.channel === 'waffo' ? payload.waffo_txn : payload.stripe_txn;
}

export function fulfillmentScope(payload: Fulfillment): string {
  return payload.channel === 'waffo' ? `waffo:${payload.mode}` : 'stripe';
}

export function parseFulfillment(raw: Uint8Array): Fulfillment {
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(Buffer.from(raw).toString('utf8'))); }
  catch { throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.'); }
  if (typeof body.ref !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.ref) ||
      typeof body.product_id !== 'string' || !body.product_id ||
      typeof body.out_trade_no !== 'string' || !body.out_trade_no ||
      typeof body.currency !== 'string' || !body.currency) {
    throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.');
  }
  if (body.channel === 'stripe') {
    if (body.event_type !== 'checkout.session.completed' || typeof body.stripe_txn !== 'string' || !body.stripe_txn.trim() ||
        !Number.isSafeInteger(body.amount_cents) || Number(body.amount_cents) <= 0) {
      throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.');
    }
  } else if (body.channel === 'waffo') {
    if (body.event_type !== 'order.completed' || !['prod', 'test'].includes(String(body.mode)) ||
        typeof body.waffo_txn !== 'string' || !body.waffo_txn.trim() ||
        typeof body.waffo_order_id !== 'string' || !body.waffo_order_id.trim() ||
        typeof body.amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(body.amount) ||
        !/^PROD_[0-9A-Za-z]{22}$/.test(String(body.product_id))) {
      throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.');
    }
    try { moneyToCents(body.amount); }
    catch { throw new PaymentError('callback_invalid', 400, 'Invalid payment notification.'); }
  } else {
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
      payload.currency.toUpperCase() !== snapshot.currency) {
    throw new PaymentError('payment_mismatch', 409, 'Payment details do not match this order.', order.id);
  }
  if ((payload.channel === 'stripe' && payload.event_type !== 'checkout.session.completed') ||
      (payload.channel === 'waffo' && payload.event_type !== 'order.completed')) {
    throw new PaymentError('payment_mismatch', 409, 'Payment details do not match this order.', order.id);
  }
  const amountCents = payload.channel === 'waffo' ? moneyToCents(payload.amount) : payload.amount_cents;
  if (amountCents !== snapshot.amountCents || payload.channel === 'waffo' &&
      (snapshot.channel !== 'waffo' || payload.mode !== snapshot.gatewayEnvironment ||
       meta.gatewayTransactionOrderId !== undefined && meta.gatewayTransactionOrderId !== payload.waffo_order_id)) {
    throw new PaymentError('payment_mismatch', 409, 'Payment details do not match this order.', order.id);
  }
  const transactionId = fulfillmentTransaction(payload);
  if (order.status === 'succeeded' && meta.transactionId === transactionId &&
      (payload.channel !== 'waffo' || meta.gatewayTransactionOrderId === payload.waffo_order_id)) return 'duplicate';
  if (meta.transactionId || !['pending', 'expired'].includes(order.status)) {
    throw new PaymentError('transaction_conflict', 409, 'This payment needs review.', order.id);
  }
  return 'deliver';
}

export interface FulfillmentRepository {
  lockTransaction(transactionId: string): Promise<void>;
  lockOrder(id: string): Promise<PaymentOrder | undefined>;
  findTransaction(transactionId: string, payload: Fulfillment): Promise<PaymentOrder | undefined>;
  findGatewayTransactionOrder(id: string, payload: WaffoFulfillment): Promise<PaymentOrder | undefined>;
  planType(planId: string): Promise<string | undefined>;
  succeed(order: PaymentOrder, metadata: PaymentMetadata): Promise<void>;
}

// The repository is supplied by a single database transaction. No entitlement is
// granted until every immutable snapshot and transaction binding has been checked.
export async function applyFulfillment(repository: FulfillmentRepository, payload: Fulfillment): Promise<'delivered' | 'duplicate'> {
  const transactionId = fulfillmentTransaction(payload);
  const scope = fulfillmentScope(payload);
  await repository.lockTransaction(`${scope}:transaction:${transactionId}`);
  if (payload.channel === 'waffo') await repository.lockTransaction(`${scope}:order:${payload.waffo_order_id}`);
  const order = await repository.lockOrder(payload.ref);
  if (!order) throw new PaymentError('order_not_found', 404, 'Order not found.');
  const action = validateFulfillment(order, payload);
  const bound = await repository.findTransaction(transactionId, payload);
  if (bound && bound.id !== order.id) throw new PaymentError('transaction_reused', 409, 'This payment is already assigned to another order.', order.id);
  if (payload.channel === 'waffo') {
    const boundOrder = await repository.findGatewayTransactionOrder(payload.waffo_order_id, payload);
    if (boundOrder && boundOrder.id !== order.id) throw new PaymentError('transaction_reused', 409, 'This payment is already assigned to another order.', order.id);
  }
  if (action === 'duplicate') return 'duplicate';
  if (!order.planId || await repository.planType(order.planId) !== 'lifetime') {
    throw new PaymentError('plan_changed', 409, 'The purchased plan needs review.', order.id);
  }
  await repository.succeed(order, {
    ...metadataOf(order), transactionId, eventType: payload.event_type,
    ...(payload.channel === 'waffo' ? { gatewayTransactionOrderId: payload.waffo_order_id } : {}),
  });
  return 'delivered';
}
