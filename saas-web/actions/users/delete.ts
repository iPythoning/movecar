'use server'

import { actionResponse, type ActionResult } from '@/lib/action-response'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { eq } from 'drizzle-orm'

/**
 * Delete the current user's account and all associated data.
 *
 * movecar_* tables reference user.id with onDelete: cascade, so removing the
 * user row cascades to tags, notifications, push tokens, and Better Auth
 * sessions/accounts/verifications.
 */
export async function deleteMyAccountAction(): Promise<ActionResult<void>> {
  const session = await getSession()
  if (!session?.user?.id) return actionResponse.unauthorized()

  const userId = session.user.id

  try {
    await db.delete(user).where(eq(user.id, userId))
    return actionResponse.success()
  } catch (error) {
    console.error('[user] deleteMyAccount failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}
