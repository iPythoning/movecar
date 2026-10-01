import 'server-only'

import { movecarTags } from '@/lib/db/schema'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import type { MovecarTransaction } from '@/lib/movecar/user-lock'
import { and, desc, eq, inArray } from 'drizzle-orm'

export async function enforceTagLimit(tx: MovecarTransaction, userId: string): Promise<number> {
  const plan = await resolveMovecarPlan(userId, tx)
  if (plan.maxTags === -1) return 0

  const activeTags = await tx.select({ id: movecarTags.id }).from(movecarTags)
    .where(and(eq(movecarTags.userId, userId), eq(movecarTags.isActive, true)))
    .orderBy(desc(movecarTags.createdAt), desc(movecarTags.id))
  const extraIds = activeTags.slice(plan.maxTags).map(tag => tag.id)
  if (!extraIds.length) return 0

  const changed = await tx.update(movecarTags).set({ isActive: false })
    .where(and(eq(movecarTags.userId, userId), inArray(movecarTags.id, extraIds)))
    .returning({ id: movecarTags.id })
  return changed.length
}
