import { db } from '@/lib/db'
import { movecarPushTokens } from '@/lib/db/schema'
import { getErrorMessage } from '@/lib/error-utils'
import { redis } from '@/lib/upstash'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/**
 * Telegram Bot webhook for MoveCar.
 *
 * BotFather setWebhook example:
 *   https://api.telegram.org/bot<TELEGRAM_MOVECAR_BOT_TOKEN>/setWebhook
 *   ?url=https://movecar.autoglobalai.com/api/internal/movecar/telegram-webhook
 *   &secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Flow:
 *   1. User clicks "Bind Telegram" in Dashboard → code stored in Redis
 *      `movecar:tg_bind:<code>` → userId (TTL 10min).
 *   2. User opens t.me/<bot>?start=<code>.
 *   3. Telegram POSTs here with `/start <code>`.
 *   4. We resolve userId, insert a movecar_push_tokens row
 *      (channel='telegram', tokenValue=chat_id), and delete the Redis key.
 */

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

interface TelegramUpdate {
  message?: {
    chat: { id: number; username?: string; first_name?: string }
    text?: string
    from?: { id: number; username?: string }
  }
}

export async function POST(request: Request) {
  // Optional secret-token validation
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
    const url = new URL(request.url)
    const secretQuery = url.searchParams.get('secret')
    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET && secretQuery !== TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  if (!redis) {
    console.error('[movecar/telegram-webhook] Redis not configured')
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const messageText = update.message?.text?.trim()
  const chatId = update.message?.chat.id

  if (!messageText || !chatId) {
    return NextResponse.json({ ok: true })
  }

  const match = messageText.match(/^\/start\s+(\S+)$/i)
  if (!match) {
    return NextResponse.json({ ok: true })
  }

  const code = match[1]
  const redisKey = `movecar:tg_bind:${code}`

  try {
    const userId = await redis.get(redisKey)
    if (!userId) {
      console.warn(`[movecar/telegram-webhook] Binding code not found or expired: ${code}`)
      return NextResponse.json({ ok: false, error: 'code_expired' }, { status: 400 })
    }

    // Upsert push token
    const existing = await db
      .select({ id: movecarPushTokens.id })
      .from(movecarPushTokens)
      .where(
        eq(movecarPushTokens.tokenValue, String(chatId))
      )
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(movecarPushTokens)
        .set({ isEnabled: true, userId: userId as string })
        .where(eq(movecarPushTokens.id, existing[0].id))
    } else {
      await db.insert(movecarPushTokens).values({
        userId: userId as string,
        channel: 'telegram',
        tokenValue: String(chatId),
        isEnabled: true,
      })
    }

    await redis.del(redisKey)

    console.log(
      `[movecar/telegram-webhook] Bound Telegram chat ${chatId} to user ${userId}`
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[movecar/telegram-webhook] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
