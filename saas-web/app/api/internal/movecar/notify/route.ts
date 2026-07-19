import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import {
  movecarNotifications,
  movecarPushTokens,
  movecarTags,
  user,
} from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import {
  ONE_TIME_TOKEN_TTL_SECONDS,
  signOneTimeToken,
  verifyInternalRequest,
} from '@/lib/movecar/internal-auth'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import { and, eq, gt, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

const notifySchema = z.object({
  shortCode: z.string().min(1),
  message: z.string().max(500).optional(),
  requesterLocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  requesterIp: z.string().max(45),
})

// per-tag rate limit: 20 notifications / hour
const TAG_NOTIF_LIMIT_PER_HOUR = 20

export async function POST(req: Request) {
  const rawBody = await req.text()
  const auth = await verifyInternalRequest(req, rawBody)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? 'unauthorized' },
      { status: 401 }
    )
  }

  let parsed: z.infer<typeof notifySchema>
  try {
    parsed = notifySchema.parse(JSON.parse(rawBody))
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 400 }
    )
  }

  try {
    const [tagRow] = await db
      .select({
        id: movecarTags.id,
        userId: movecarTags.userId,
        isActive: movecarTags.isActive,
        settings: movecarTags.settings,
      })
      .from(movecarTags)
      .where(eq(movecarTags.shortCode, parsed.shortCode))
      .limit(1)

    if (!tagRow) {
      return NextResponse.json(
        { ok: false, error: 'tag_not_found' },
        { status: 404 }
      )
    }
    if (!tagRow.isActive) {
      return NextResponse.json(
        { ok: false, error: 'tag_inactive' },
        { status: 410 }
      )
    }

    // per-tag rate limit (belt & suspenders; Worker edge also limits)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)::int` })
      .from(movecarNotifications)
      .where(
        and(
          eq(movecarNotifications.tagId, tagRow.id),
          gt(movecarNotifications.createdAt, hourAgo)
        )
      )
    if ((recent ?? 0) >= TAG_NOTIF_LIMIT_PER_HOUR) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429 }
      )
    }

    const plan = await resolveMovecarPlan(tagRow.userId)

    // Enforce monthly notification limit for Free tier.
    if (plan.maxNotificationsPerMonth !== -1) {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
      const [{ monthCount }] = await db
        .select({ monthCount: sql<number>`count(*)::int` })
        .from(movecarNotifications)
        .innerJoin(movecarTags, eq(movecarNotifications.tagId, movecarTags.id))
        .where(
          and(
            eq(movecarTags.userId, tagRow.userId),
            gt(movecarNotifications.createdAt, startOfMonth)
          )
        )

      if ((monthCount ?? 0) >= plan.maxNotificationsPerMonth) {
        return NextResponse.json(
          { ok: false, error: 'monthly_limit_reached' },
          { status: 429 }
        )
      }
    }

    const settings = (tagRow.settings ?? {}) as { delaySeconds?: number }
    const delaySeconds = parsed.requesterLocation
      ? 0
      : (settings.delaySeconds ?? 30)

    const [notif] = await db
      .insert(movecarNotifications)
      .values({
        tagId: tagRow.id,
        requesterIp: parsed.requesterIp,
        requesterLocation: parsed.requesterLocation,
        message: parsed.message,
        status: 'pending',
        channelsSent: [],
      })
      .returning({ id: movecarNotifications.id })

    if (!notif) throw new Error('failed to insert notification')

    const tokens = await db
      .select({
        channel: movecarPushTokens.channel,
        tokenValue: movecarPushTokens.tokenValue,
      })
      .from(movecarPushTokens)
      .where(
        and(
          eq(movecarPushTokens.userId, tagRow.userId),
          eq(movecarPushTokens.isEnabled, true)
        )
      )

    const allowed = new Set(plan.allowedChannels)
    const pushTokens = tokens.filter((t) => allowed.has(t.channel))

    // Email is tied to the user's account email; no explicit token required.
    if (allowed.has('email')) {
      const [userRow] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, tagRow.userId))
        .limit(1)
      if (userRow?.email) {
        pushTokens.push({ channel: 'email' as const, tokenValue: userRow.email })
      }
    }

    const expSec = Math.floor(Date.now() / 1000) + ONE_TIME_TOKEN_TTL_SECONDS
    const oneTimeToken = await signOneTimeToken({ n: notif.id, e: expSec })

    return NextResponse.json({
      notificationId: notif.id,
      oneTimeToken,
      pushTokens,
      delayedUntil:
        delaySeconds > 0
          ? Math.floor(Date.now() / 1000) + delaySeconds
          : undefined,
    })
  } catch (error) {
    console.error('[movecar/internal/notify] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
