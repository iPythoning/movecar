import type { Env } from '../index'
import type { NotifyPayload, PushResult } from './index'

/**
 * Telegram Bot API — `tokenValue` is the chat_id captured during the
 * `/start <bindingCode>` flow in the SaaS Dashboard. See
 * actions/movecar/push-tokens.ts `initTelegramBindingAction`.
 */
export async function sendTelegram(
  env: Env,
  chatId: string,
  payload: NotifyPayload
): Promise<PushResult> {
  if (!env.TELEGRAM_MOVECAR_BOT_TOKEN) {
    return {
      channel: 'telegram',
      ok: false,
      detail: 'TELEGRAM_MOVECAR_BOT_TOKEN_unset',
    }
  }

  const text = [
    `<b>${escape(payload.title)}</b>`,
    escape(payload.body),
    payload.url ? `<a href="${payload.url}">${payload.url}</a>` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_MOVECAR_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      channel: 'telegram',
      ok: false,
      detail: `status=${res.status} body=${body.slice(0, 200)}`,
    }
  }
  return { channel: 'telegram', ok: true }
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
