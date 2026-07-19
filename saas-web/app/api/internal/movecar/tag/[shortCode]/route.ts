import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { movecarTags } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { verifyInternalRequest } from '@/lib/movecar/internal-auth'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shortCode: string }> }
) {
  const rawBody = '' // GET has no body
  const auth = await verifyInternalRequest(req, rawBody)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? 'unauthorized' },
      { status: 401 }
    )
  }

  const { shortCode } = await ctx.params
  if (!shortCode) {
    return NextResponse.json({ ok: false, error: 'missing_short_code' }, { status: 400 })
  }

  try {
    const rows = await db
      .select({
        tagId: movecarTags.id,
        ownerId: movecarTags.userId,
        isActive: movecarTags.isActive,
        templateId: movecarTags.templateId,
        settings: movecarTags.settings,
      })
      .from(movecarTags)
      .where(eq(movecarTags.shortCode, shortCode))
      .limit(1)

    const tag = rows[0]
    if (!tag) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }

    const plan = await resolveMovecarPlan(tag.ownerId)

    const settings = (tag.settings ?? {}) as { delaySeconds?: number }

    return NextResponse.json({
      tagId: tag.tagId,
      ownerId: tag.ownerId,
      isActive: tag.isActive,
      planType: plan.plan,
      templateId: tag.templateId,
      delaySeconds: settings.delaySeconds ?? 30,
    })
  } catch (error) {
    console.error('[movecar/internal/tag] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
