import { db } from '@/lib/db'
import {
  movecarTags,
  pricingPlans,
  subscriptions,
} from '@/lib/db/schema'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/**
 * Daily cron to downgrade expired MoveCar subscriptions to Free.
 *
 * For every recurring subscription whose currentPeriodEnd has passed and status
 * is not already canceled/unpaid, we disable all but the most recently created
 * tag (the Free tier only allows 1 active tag).
 *
 * Trigger: Vercel Cron daily at 00:00 UTC
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
    // We exclude already-terminal statuses but include past_due/unpaid so they
    // lose Pro access as soon as the paid period ends.
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

    for (const row of expiredRows) {
      if (!row.userId) continue

      // Keep the most recently created tag active; disable the rest.
      const userTags = await db
        .select({ id: movecarTags.id, createdAt: movecarTags.createdAt })
        .from(movecarTags)
        .where(eq(movecarTags.userId, row.userId))
        .orderBy(sql`${movecarTags.createdAt} DESC`)

      const tagsToDisable = userTags.slice(1).map((t) => t.id)

      if (tagsToDisable.length > 0) {
        await db
          .update(movecarTags)
          .set({ isActive: false })
          .where(
            and(
              eq(movecarTags.userId, row.userId),
              inArray(movecarTags.id, tagsToDisable)
            )
          )
        deactivatedTags += tagsToDisable.length
      }

      console.log(
        `[movecar/expire-check] Downgraded user ${row.userId} (sub ${row.subscriptionId}, plan ${row.planType})`
      )
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
