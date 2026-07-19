import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { movecarNotifications } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import {
  verifyInternalRequest,
  verifyOneTimeToken,
} from '@/lib/movecar/internal-auth'
import { and, eq, isNull } from 'drizzle-orm'

export const runtime = 'nodejs'

const confirmSchema = z.object({
  notificationId: z.string().uuid(),
  oneTimeToken: z.string().min(1),
  ownerReply: z.string().trim().min(1).max(500),
  ownerLocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
})

export async function POST(req: Request) {
  const rawBody = await req.text()
  const auth = await verifyInternalRequest(req, rawBody)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? 'unauthorized' },
      { status: 401 }
    )
  }

  let parsed: z.infer<typeof confirmSchema>
  try {
    parsed = confirmSchema.parse(JSON.parse(rawBody))
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 400 }
    )
  }

  const payload = await verifyOneTimeToken(parsed.oneTimeToken)
  if (!payload || payload.n !== parsed.notificationId) {
    return NextResponse.json(
      { ok: false, error: 'invalid_token' },
      { status: 401 }
    )
  }

  try {
    // Atomic single-use: update succeeds only if repliedAt is still NULL.
    // Replaying the same token hits this row with repliedAt already set and
    // the WHERE clause filters it out → returned set is empty → 410.
    const updated = await db
      .update(movecarNotifications)
      .set({
        status: 'replied',
        ownerReply: parsed.ownerReply,
        ownerLocation: parsed.ownerLocation,
        repliedAt: new Date(),
      })
      .where(
        and(
          eq(movecarNotifications.id, parsed.notificationId),
          isNull(movecarNotifications.repliedAt)
        )
      )
      .returning({ id: movecarNotifications.id })

    if (updated.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'already_replied_or_missing' },
        { status: 410 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[movecar/internal/owner-confirm] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
