import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveMovecarPlan } from '@/lib/movecar/plan';
import { orders, pricingPlans } from '@/lib/db/schema';
import {
  applyFulfillment, Fulfillment, metadataOf, PaymentError, PaymentMetadata,
  PaymentOrder, reusableCheckout, snapshotPlan,
} from './core';
import { paymentConfig } from './config';
import { createGatewayCheckout, reconcileGatewayOrder } from './gateway';

function publicOrder(order: PaymentOrder) {
  const meta = metadataOf(order);
  const checkout = order.status === 'pending' && meta.checkoutState === 'ready' &&
    meta.checkout && Date.parse(meta.checkout.expiresAt) > Date.now() ? meta.checkout : undefined;
  return {
    orderId: order.id, status: order.status, planName: meta.snapshot.title,
    amount: order.amountTotal, currency: order.currency,
    checkoutUrl: checkout?.checkoutUrl, expiresAt: checkout?.expiresAt,
  };
}

export async function checkoutPlan(userId: string, buyerEmail: string, planId: string) {
  const config = paymentConfig();
  const reservation = await db.transaction(async tx => {
    // Commit a pending reservation before the external request. Other processes
    // see this row while the first request is waiting on the gateway.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`movecar-user:${userId}`}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`paibao:checkout:${userId}:${planId}`}, 0))`);
    const [plan] = await tx.select().from(pricingPlans).where(eq(pricingPlans.id, planId)).limit(1).for('share');
    if (!plan) throw new PaymentError('plan_not_found', 404, 'Plan not found.');
    const snapshot = snapshotPlan(plan, config.environment);
    const [existing] = await tx.select().from(orders).where(and(
      eq(orders.userId, userId), eq(orders.planId, planId), eq(orders.provider, 'paibao'),
      inArray(orders.status, ['pending', 'succeeded']),
    )).orderBy(desc(orders.createdAt)).limit(1).for('update');
    if (existing?.status === 'succeeded') {
      throw new PaymentError('already_purchased', 409, 'You already own this plan.', existing.id);
    }
    if ((await resolveMovecarPlan(userId, tx)).plan === 'lifetime') {
      throw new PaymentError('already_purchased', 409, 'You already own a Lifetime plan.');
    }
    if (existing) {
      reusableCheckout(existing, snapshot, new Date());
      return { created: false, order: existing, snapshot };
    }
    const id = randomUUID();
    const metadata: PaymentMetadata = { snapshot, checkoutState: 'creating' };
    const [order] = await tx.insert(orders).values({
      id, userId, provider: 'paibao', providerOrderId: `pending:${id}`,
      orderType: 'one_time_purchase', status: 'pending', planId: plan.id, productId: snapshot.productId,
      amountSubtotal: (snapshot.amountCents / 100).toFixed(2),
      amountTotal: (snapshot.amountCents / 100).toFixed(2), currency: snapshot.currency, metadata,
    }).returning();
    return { created: true, order, snapshot };
  });
  if (!reservation.created) return publicOrder(reservation.order);

  try {
    const checkout = await createGatewayCheckout(config, reservation.snapshot, reservation.order.id, buyerEmail);
    const saved = await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, reservation.order.id)).limit(1).for('update');
      const meta = metadataOf(order);
      if (meta.checkoutState !== 'creating' || order.status !== 'pending') {
        throw new PaymentError('checkout_state_conflict', 409, 'This checkout needs review.', order.id);
      }
      const metadata: PaymentMetadata = { ...meta, checkoutState: 'ready', checkout };
      const [updated] = await tx.update(orders).set({
        providerOrderId: checkout.gatewayOrderId, metadata, updatedAt: new Date(),
      }).where(eq(orders.id, order.id)).returning();
      return updated;
    });
    return publicOrder(saved);
  } catch (error) {
    // Even a timeout/5xx may follow a successful provider creation. Preserve the
    // reservation and never blindly create a second chargeable session.
    await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, reservation.order.id)).limit(1).for('update');
      const meta = metadataOf(order);
      if (meta.checkoutState === 'creating') {
        await tx.update(orders).set({ metadata: { ...meta, checkoutState: 'unknown' }, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
    });
    console.error('Payment checkout was not confirmed', { orderId: reservation.order.id, code: error instanceof PaymentError ? error.code : 'gateway_or_storage_failure' });
    throw new PaymentError('checkout_result_unknown', 503, 'Checkout could not be confirmed. Check this order before trying again.', reservation.order.id);
  }
}

export async function fulfillPayment(payload: Fulfillment) {
  return db.transaction(async tx => applyFulfillment({
    async lockTransaction(transactionId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`paibao:stripe:transaction:${transactionId}`}, 0))`);
    },
    async lockOrder(id) {
      const [owner] = await tx.select({ userId: orders.userId }).from(orders).where(eq(orders.id, id)).limit(1);
      if (!owner) return undefined;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`movecar-user:${owner.userId}`}, 0))`);
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update');
      return order;
    },
    async findTransaction(transactionId) {
      const [order] = await tx.select().from(orders).where(and(
        eq(orders.provider, 'paibao'),
        sql`${orders.metadata}->>'transactionId' = ${transactionId}`,
        sql`${orders.metadata}->'snapshot'->>'channel' = 'stripe'`,
      )).limit(1);
      return order;
    },
    async planType(planId) {
      const [plan] = await tx.select({ type: sql<string>`${pricingPlans.benefitsJsonb}->>'movecarPlanType'` })
        .from(pricingPlans).where(eq(pricingPlans.id, planId)).limit(1).for('share');
      return plan?.type;
    },
    async succeed(order, metadata) {
      await tx.update(orders).set({ status: 'succeeded', metadata, updatedAt: new Date() }).where(eq(orders.id, order.id));
    },
  }, payload));
}

export async function getPaymentOrder(userId: string, id: string) {
  const [order] = await db.select().from(orders).where(and(
    eq(orders.id, id), eq(orders.userId, userId), eq(orders.provider, 'paibao'),
  )).limit(1);
  if (!order) throw new PaymentError('order_not_found', 404, 'Order not found.');
  const meta = metadataOf(order);
  if (order.status === 'pending' && meta.checkoutState === 'ready' && meta.checkout) {
    const config = paymentConfig();
    const permitted = await db.transaction(async tx => {
      const [current] = await tx.select().from(orders).where(and(
        eq(orders.id, id), eq(orders.userId, userId), eq(orders.provider, 'paibao'),
      )).limit(1).for('update');
      if (!current) throw new PaymentError('order_not_found', 404, 'Order not found.');
      const currentMeta = metadataOf(current);
      if (current.status !== 'pending' || currentMeta.checkoutState !== 'ready' || !currentMeta.checkout) {
        return { order: current, reconcile: false };
      }
      const checkedAt = Date.now();
      if (currentMeta.lastReconciledAt && checkedAt - Date.parse(currentMeta.lastReconciledAt) < config.reconcileIntervalMs) {
        return { order: current, reconcile: false };
      }
      await tx.update(orders).set({
        metadata: { ...currentMeta, lastReconciledAt: new Date(checkedAt).toISOString() },
        updatedAt: new Date(checkedAt),
      }).where(eq(orders.id, id));
      return { order: current, reconcile: true };
    });
    if (!permitted.reconcile) return publicOrder(permitted.order);
    // Reconciliation triggers signed delivery. A gateway "paid" string cannot
    // authorize access: only the verified fulfill transaction sets succeeded.
    const gatewayStatus = await reconcileGatewayOrder(config, meta.checkout.gatewayOrderId);
    if (gatewayStatus === 'expired' && Date.parse(meta.checkout.expiresAt) <= Date.now()) {
      await db.update(orders).set({ status: 'expired', updatedAt: new Date() })
        .where(and(eq(orders.id, id), eq(orders.status, 'pending')));
    }
    const [current] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1);
    return publicOrder(current);
  }
  return publicOrder(order);
}
