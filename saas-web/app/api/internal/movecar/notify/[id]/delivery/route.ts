import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { movecarNotifications } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { verifyInternalRequest } from '@/lib/movecar/internal-auth'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

const deliverySchema = z.object({
  channelsSent: z.array(z.string()).default([]),
  channelsFailed: z.array(z.string()).default([]),
})

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const rawBody = await req.text()
  const auth = await verifyInternalRequest(req, rawBody)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? 'unauthorized' },
      { status: 401 }
    )
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 })
  }

  let parsed: z.infer<typeof deliverySchema>
  try {
    parsed = deliverySchema.parse(JSON.parse(rawBody))
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 400 }
    )
  }

  try {
    const status = parsed.channelsSent.length > 0 ? 'sent' : 'failed'
    const updated = await db
      .update(movecarNotifications)
      .set({
        status,
        channelsSent: parsed.channelsSent,
      })
      .where(eq(movecarNotifications.id, id))
      .returning({ id: movecarNotifications.id })

    if (updated.length === 0) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[movecar/internal/notify/delivery] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
