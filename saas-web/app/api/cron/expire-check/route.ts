import { db } from '@/lib/db'
import {
  pricingPlans,
  subscriptions,
} from '@/lib/db/schema'
import { and, eq, lte, sql } from 'drizzle-orm'
import { enforceTagLimit } from '@/lib/movecar/enforce-tag-limit'
import { withMovecarUserLock } from '@/lib/movecar/user-lock'
import { NextResponse } from 'next/server'

/**
 * Daily cron to downgrade expired MoveCar subscriptions to Free.
 *
 * Recheck each user's current entitlement before limiting active tags. An old
 * expired subscription must not override a renewal or lifetime purchase.
 *
 * Trigger: Cloudflare Cron daily at 00:00 UTC
 *   { "path": "/api/cron/expire-check", "schedule": "0 0 * * *" }
 *
 * Or manually with header: `Authorization: Bearer ${CRON_SECRET}`
 */

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  // Authorize cron call
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const secret =
    authHeader?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret')

  if (!CRON_SECRET) {
    console.error('[movecar/expire-check] CRON_SECRET is not configured')
    return NextResponse.json(
      { ok: false, error: 'cron_secret_not_configured' },
      { status: 500 }
    )
  }

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()

  try {
    // Find expired recurring subscriptions that map to a MoveCar paid plan.
    const expiredRows = await db
      .select({
        subscriptionId: subscriptions.subscriptionId,
        userId: subscriptions.userId,
        planType: sql<string>`${pricingPlans.benefitsJsonb}->>'movecarPlanType'`,
      })
      .from(subscriptions)
      .innerJoin(pricingPlans, eq(subscriptions.planId, pricingPlans.id))
      .where(
        and(
          sql`${pricingPlans.benefitsJsonb}->>'movecarPlanType' IN ('pro_monthly', 'pro_yearly')`,
          lte(subscriptions.currentPeriodEnd, now),
          eq(pricingPlans.paymentType, 'recurring')
        )
      )

    let deactivatedTags = 0

    const userIds = [...new Set(expiredRows.map((row) => row.userId).filter(Boolean))]
    for (const userId of userIds) {
      if (!userId) continue
      deactivatedTags += await withMovecarUserLock(userId, async (tx) => {
        return enforceTagLimit(tx, userId)
      })
    }

    return NextResponse.json({
      ok: true,
      expiredSubscriptions: expiredRows.length,
      deactivatedTags,
    })
  } catch (error) {
    console.error('[movecar/expire-check] Cron failed:', error)
    return NextResponse.json(
      { ok: false, error: 'internal_error' },
      { status: 500 }
    )
  }
}
