'use server'

import { createHmac } from 'node:crypto'

import { actionResponse, type ActionResult } from '@/lib/action-response'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarPushTokens } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { resolveMovecarPlan } from '@/lib/movecar/plan'
import {
  addPushTokenSchema,
  type AddPushTokenInput,
  type PushChannel,
  PUSH_CHANNELS,
} from '@/lib/movecar/validations'
import { redis } from '@/lib/upstash'
import { and, eq } from 'drizzle-orm'

export type MovecarPushToken = typeof movecarPushTokens.$inferSelect

const TELEGRAM_BIND_TTL_SECONDS = 10 * 60

async function requireUser() {
  const session = await getSession()
  if (!session?.user?.id) return null
  return session.user
}

export async function listMyPushTokensAction(): Promise<
  ActionResult<{ tokens: MovecarPushToken[] }>
> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const rows = await db
      .select()
      .from(movecarPushTokens)
      .where(eq(movecarPushTokens.userId, user.id))
    return actionResponse.success({ tokens: rows })
  } catch (error) {
    console.error('[movecar] listMyPushTokens failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function addPushTokenAction(
  input: AddPushTokenInput
): Promise<ActionResult<{ token: MovecarPushToken }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  const parsed = addPushTokenSchema.safeParse(input)
  if (!parsed.success) {
    return actionResponse.badRequest(parsed.error.issues[0]?.message ?? 'invalid input')
  }

  const plan = await resolveMovecarPlan(user.id)
  if (!plan.allowedChannels.includes(parsed.data.channel)) {
    return actionResponse.forbidden(
      `Your plan does not allow the ${parsed.data.channel} channel.`,
      'PLAN_CHANNEL_NOT_ALLOWED'
    )
  }

  try {
    const [row] = await db
      .insert(movecarPushTokens)
      .values({
        userId: user.id,
        channel: parsed.data.channel,
        tokenValue: parsed.data.tokenValue,
        isEnabled: true,
      })
      .returning()
    if (!row) throw new Error('no row returned on insert')
    return actionResponse.success({ token: row })
  } catch (error) {
    console.error('[movecar] addPushToken failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function togglePushTokenAction(
  id: string
): Promise<ActionResult<{ token: MovecarPushToken }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const [current] = await db
      .select({ isEnabled: movecarPushTokens.isEnabled })
      .from(movecarPushTokens)
      .where(
        and(eq(movecarPushTokens.id, id), eq(movecarPushTokens.userId, user.id))
      )
      .limit(1)
    if (!current) return actionResponse.notFound()

    const [row] = await db
      .update(movecarPushTokens)
      .set({ isEnabled: !current.isEnabled })
      .where(
        and(eq(movecarPushTokens.id, id), eq(movecarPushTokens.userId, user.id))
      )
      .returning()
    if (!row) return actionResponse.notFound()
    return actionResponse.success({ token: row })
  } catch (error) {
    console.error('[movecar] togglePushToken failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function deletePushTokenAction(
  id: string
): Promise<ActionResult<void>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const result = await db
      .delete(movecarPushTokens)
      .where(
        and(eq(movecarPushTokens.id, id), eq(movecarPushTokens.userId, user.id))
      )
      .returning({ id: movecarPushTokens.id })
    if (result.length === 0) return actionResponse.notFound()
    return actionResponse.success()
  } catch (error) {
    console.error('[movecar] deletePushToken failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

// ---------- Telegram binding -----------------------------------------------
//
// Flow:
//   1. User clicks "Bind Telegram" → we generate a short-lived code, store
//      `movecar:tg_bind:<code>` → userId in Redis (TTL 10min).
//   2. User scans QR / opens t.me/<bot>?start=<code>.
//   3. Bot backend receives /start <code>, resolves userId, writes
//      a push_token row with channel='telegram', tokenValue=<chat_id>.
//   4. Bot backend deletes the Redis key.
//
// initTelegramBindingAction returns the deep link + code for the UI.

function randomBindingCode(): string {
  // 32 hex chars → safe for both URL and Redis key
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function initTelegramBindingAction(): Promise<
  ActionResult<{ deepLink: string; code: string; expiresInSeconds: number }>
> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()
  if (!redis) {
    return actionResponse.error(
      'Redis is not configured — Telegram binding unavailable.',
      'REDIS_UNAVAILABLE'
    )
  }
  const botUsername = process.env.TELEGRAM_MOVECAR_BOT_USERNAME
  if (!botUsername) {
    return actionResponse.error(
      'TELEGRAM_MOVECAR_BOT_USERNAME not set.',
      'CONFIG_MISSING'
    )
  }

  try {
    const code = randomBindingCode()
    await redis.set(`movecar:tg_bind:${code}`, user.id, {
      ex: TELEGRAM_BIND_TTL_SECONDS,
    })
    return actionResponse.success({
      deepLink: `https://t.me/${botUsername}?start=${code}`,
      code,
      expiresInSeconds: TELEGRAM_BIND_TTL_SECONDS,
    })
  } catch (error) {
    console.error('[movecar] initTelegramBinding failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}

export async function sendTestPushAction(
  tokenId: string
): Promise<ActionResult<{ delivered: boolean; channel: PushChannel }>> {
  const user = await requireUser()
  if (!user) return actionResponse.unauthorized()

  try {
    const [row] = await db
      .select()
      .from(movecarPushTokens)
      .where(
        and(
          eq(movecarPushTokens.id, tokenId),
          eq(movecarPushTokens.userId, user.id)
        )
      )
      .limit(1)
    if (!row) return actionResponse.notFound()

    const channel = row.channel as PushChannel
    if (!PUSH_CHANNELS.includes(channel)) {
      return actionResponse.error('Unsupported push channel.', 'INVALID_CHANNEL')
    }
    if (!row.isEnabled) {
      return actionResponse.forbidden('Enable this channel before testing it.', 'CHANNEL_DISABLED')
    }

    const workerUrl =
      process.env.MOVECAR_WORKER_URL ??
      process.env.NEXT_PUBLIC_WORKER_URL ??
      'https://t.autoglobalai.com'
    const path = '/api/test-push'
    const body = JSON.stringify({ userId: user.id, channel, tokenValue: row.tokenValue })
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const secret = process.env.WORKER_SECRET
    if (!secret) {
      return actionResponse.error('Worker push service is not configured.', 'CONFIG_MISSING')
    }
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.POST.${path}.${body}`)
      .digest('hex')

    const response = await fetch(`${workerUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-signature': signature,
        'x-internal-timestamp': timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return actionResponse.error(
        response.status === 429
          ? 'Too many test notifications. Please try again later.'
          : 'The test notification could not be delivered.',
        response.status === 429 ? 'RATE_LIMITED' : 'PUSH_TEST_FAILED'
      )
    }
    return actionResponse.success({ delivered: true, channel })
  } catch (error) {
    console.error('[movecar] sendTestPush failed:', error)
    return actionResponse.error(getErrorMessage(error))
  }
}
