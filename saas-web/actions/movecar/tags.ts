'use server'

import { actionResponse, type ActionResult } from '@/lib/action-response'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarTags } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import { withMovecarUserLock, type MovecarTransaction } from '@/lib/movecar/user-lock'
import {
  SHORT_CODE_MAX_RETRIES,
  generateShortCode,
} from '@/lib/movecar/short-code'
import {
  createTagSchema,
  updateTagSchema,
  type CreateTagInput,
  type UpdateTagInput,
} from '@/lib/movecar/validations'
import { and, desc, eq, ne } from 'drizzle-orm'

export type MovecarTag = typeof movecarTags.$inferSelect

async function requireUser() {
  const session = await getSession()
  if (!session?.user?.id) return null
  return session.user
}

export async function listMyTagsAction(): Promise<
  ActionResult<{ tags: MovecarTag[] }>
> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const rows = await db
      .select()
      .from(movecarTags)
      .where(eq(movecarTags.userId, user.id))
      .orderBy(desc(movecarTags.createdAt))
      .limit(100)
    return actionResponse.success({ tags: rows })
  } catch (error) {
    console.error('[movecar] listMyTags failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function getMyTagAction(
  id: string
): Promise<ActionResult<{ tag: MovecarTag }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()
  if (!id) return actionResponse.badRequest('tag id required')

  try {
    const rows = await db
      .select()
      .from(movecarTags)
      .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id)))
      .limit(1)
    const tag = rows[0]
    if (!tag) return actionResponse.notFound()
    return actionResponse.success({ tag })
  } catch (error) {
    console.error('[movecar] getMyTag failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function createTagAction(
  input: CreateTagInput
): Promise<ActionResult<{ tag: MovecarTag }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  const parsed = createTagSchema.safeParse(input)
  if (!parsed.success) {
    return actionResponse.badRequest(parsed.error.issues[0]?.message ?? 'invalid input')
  }

  try {
    return await withMovecarUserLock(user.id, async (tx) => {
      const plan = await resolveMovecarPlan(user.id, tx)
      if (plan.maxTags !== -1) {
        const existing = await tx
          .select({ id: movecarTags.id })
          .from(movecarTags)
          .where(eq(movecarTags.userId, user.id))
        if (existing.length >= plan.maxTags) return tagLimit(plan.maxTags)
      }

      for (let attempt = 0; attempt < SHORT_CODE_MAX_RETRIES; attempt++) {
        const [row] = await tx
          .insert(movecarTags)
          .values({
            userId: user.id,
            shortCode: generateShortCode(),
            plateNumber: parsed.data.plateNumber,
            vehicleModel: parsed.data.vehicleModel,
            templateId: parsed.data.templateId,
            settings: parsed.data.settings,
          })
          .onConflictDoNothing({ target: movecarTags.shortCode })
          .returning()
        if (row) return actionResponse.success({ tag: row })
      }
      return actionResponse.error('could not allocate a unique short code')
    })
  } catch (error) {
    console.error('[movecar] createTag failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

function tagLimit(maxTags: number): ActionResult<{ tag: MovecarTag }> {
  return actionResponse.forbidden(
    `Tag limit reached (${maxTags}). Upgrade your plan to create more.`,
    'PLAN_TAG_LIMIT'
  )
}

async function activationLimit(tx: MovecarTransaction, userId: string, tagId: string) {
  const plan = await resolveMovecarPlan(userId, tx)
  if (plan.maxTags === -1) return null
  const activeTags = await tx
    .select({ id: movecarTags.id })
    .from(movecarTags)
    .where(and(
      eq(movecarTags.userId, userId),
      eq(movecarTags.isActive, true),
      ne(movecarTags.id, tagId)
    ))
  return activeTags.length >= plan.maxTags ? tagLimit(plan.maxTags) : null
}

export async function updateTagAction(
  id: string,
  patch: UpdateTagInput
): Promise<ActionResult<{ tag: MovecarTag }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()
  if (!id) return actionResponse.badRequest('tag id required')

  const parsed = updateTagSchema.safeParse(patch)
  if (!parsed.success) {
    return actionResponse.badRequest(parsed.error.issues[0]?.message ?? 'invalid input')
  }

  try {
    return await withMovecarUserLock(user.id, async (tx) => {
      const [current] = await tx.select({ id: movecarTags.id }).from(movecarTags)
        .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id))).limit(1)
      if (!current) return actionResponse.notFound()
      if (parsed.data.isActive === true) {
        const limit = await activationLimit(tx, user.id, id)
        if (limit) return limit
      }
      const [row] = await tx
        .update(movecarTags)
        .set({
          ...(parsed.data.plateNumber !== undefined && {
            plateNumber: parsed.data.plateNumber,
          }),
          ...(parsed.data.vehicleModel !== undefined && {
            vehicleModel: parsed.data.vehicleModel,
          }),
          ...(parsed.data.templateId && { templateId: parsed.data.templateId }),
          ...(parsed.data.settings !== undefined && { settings: parsed.data.settings }),
          ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        })
        .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id)))
        .returning()
      if (!row) return actionResponse.notFound()
      return actionResponse.success({ tag: row })
    })
  } catch (error) {
    console.error('[movecar] updateTag failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function toggleTagActiveAction(
  id: string
): Promise<ActionResult<{ tag: MovecarTag }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    return await withMovecarUserLock(user.id, async (tx) => {
      const current = await tx
        .select({ isActive: movecarTags.isActive })
        .from(movecarTags)
        .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id)))
        .limit(1)
      const prev = current[0]
      if (!prev) return actionResponse.notFound()
      if (!prev.isActive) {
        const limit = await activationLimit(tx, user.id, id)
        if (limit) return limit
      }

      const [row] = await tx
        .update(movecarTags)
        .set({ isActive: !prev.isActive })
        .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id)))
        .returning()
      if (!row) return actionResponse.notFound()
      return actionResponse.success({ tag: row })
    })
  } catch (error) {
    console.error('[movecar] toggleTagActive failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function deleteTagAction(id: string): Promise<ActionResult<void>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const result = await db
      .delete(movecarTags)
      .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, user.id)))
      .returning({ id: movecarTags.id })
    if (result.length === 0) return actionResponse.notFound()
    return actionResponse.success()
  } catch (error) {
    console.error('[movecar] deleteTag failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}
