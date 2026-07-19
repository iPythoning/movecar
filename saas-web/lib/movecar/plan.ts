import 'server-only'

import { db } from '@/lib/db'
import { orders, pricingPlans, subscriptions } from '@/lib/db/schema'
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'

export type MovecarPlanType =
  | 'free'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'lifetime'

export interface MovecarPlanEntitlements {
  plan: MovecarPlanType
  maxTags: number // -1 = unlimited
  maxNotificationsPerMonth: number // -1 = unlimited
  allowedChannels: readonly string[]
  historyRetentionDays: number
  heatmapEnabled: boolean
}

const FREE: MovecarPlanEntitlements = {
  plan: 'free',
  maxTags: 1,
  maxNotificationsPerMonth: 30,
  allowedChannels: ['bark', 'email'],
  historyRetentionDays: 7,
  heatmapEnabled: false,
}

const PRO: MovecarPlanEntitlements = {
  plan: 'pro_monthly',
  maxTags: 10,
  maxNotificationsPerMonth: -1,
  allowedChannels: ['bark', 'fcm', 'telegram', 'email'],
  historyRetentionDays: 180,
  heatmapEnabled: true,
}

const LIFETIME: MovecarPlanEntitlements = {
  ...PRO,
  plan: 'lifetime',
  maxTags: -1,
  historyRetentionDays: -1,
}

const ENTITLEMENTS: Record<MovecarPlanType, MovecarPlanEntitlements> = {
  free: FREE,
  pro_monthly: PRO,
  pro_yearly: { ...PRO, plan: 'pro_yearly' },
  lifetime: LIFETIME,
}

const PLAN_PRIORITY: Record<MovecarPlanType, number> = {
  free: 0,
  pro_monthly: 1,
  pro_yearly: 2,
  lifetime: 3,
}

const movecarPlanTypeSql = sql<string>`${pricingPlans.benefitsJsonb}->>'movecarPlanType'`

function parsePlanType(value: unknown): MovecarPlanType | null {
  if (
    typeof value === 'string' &&
    ['free', 'pro_monthly', 'pro_yearly', 'lifetime'].includes(value)
  ) {
    return value as MovecarPlanType
  }
  return null
}

/**
 * Resolve the active MoveCar plan for a user.
 *
 * Looks at:
 * 1. Active subscriptions joined to MoveCar pricing plans (via benefitsJsonb.movecarPlanType).
 * 2. Succeeded one-time orders for MoveCar lifetime plans.
 *
 * Returns the highest entitlement found, or Free if none.
 */
export async function resolveMovecarPlan(
  userId: string
): Promise<MovecarPlanEntitlements> {
  const now = new Date()

  // Active subscriptions: status active/trialing and not past currentPeriodEnd,
  // or past_due but still within current period (grace).
  const activeSubs = await db
    .select({
      planType: movecarPlanTypeSql,
    })
    .from(subscriptions)
    .innerJoin(pricingPlans, eq(subscriptions.planId, pricingPlans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        sql`${pricingPlans.benefitsJsonb}->>'movecarPlanType' IS NOT NULL`,
        or(
          and(
            inArray(subscriptions.status, ['active', 'trialing']),
            or(
              gte(subscriptions.currentPeriodEnd, now),
              isNull(subscriptions.currentPeriodEnd)
            )
          ),
          and(
            eq(subscriptions.status, 'past_due'),
            gte(subscriptions.currentPeriodEnd, now)
          )
        )
      )
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))

  // One-time purchases (e.g. lifetime) recorded as orders.
  const oneTimeOrders = await db
    .select({
      planType: movecarPlanTypeSql,
    })
    .from(orders)
    .innerJoin(pricingPlans, eq(orders.planId, pricingPlans.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, 'succeeded'),
        eq(orders.orderType, 'one_time_purchase'),
        sql`${pricingPlans.benefitsJsonb}->>'movecarPlanType' IS NOT NULL`
      )
    )

  const allTypes: MovecarPlanType[] = []
  for (const row of [...activeSubs, ...oneTimeOrders]) {
    const planType = parsePlanType(row.planType)
    if (planType) allTypes.push(planType)
  }

  if (allTypes.length === 0) return FREE

  const bestType = allTypes.reduce((best, current) =>
    PLAN_PRIORITY[current] > PLAN_PRIORITY[best] ? current : best
  )

  return ENTITLEMENTS[bestType]
}

export function getEntitlements(
  plan: MovecarPlanType
): MovecarPlanEntitlements {
  return ENTITLEMENTS[plan]
}
