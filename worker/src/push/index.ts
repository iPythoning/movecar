import type { Env } from '../index'
import { sendBark } from './bark'
import { sendEmail } from './email'
import { sendFcm } from './fcm'
import { sendTelegram } from './telegram'

export type Channel =
  | 'bark'
  | 'fcm'
  | 'telegram'
  | 'whatsapp'
  | 'sms'
  | 'email'

export interface PushToken {
  channel: Channel
  tokenValue: string
}

export interface NotifyPayload {
  title: string
  body: string
  url?: string
  level?: 'active' | 'timeSensitive' | 'passive' | 'critical'
}

export interface PushResult {
  channel: Channel
  ok: boolean
  detail?: string
}

export async function dispatchPush(
  env: Env,
  tokens: PushToken[],
  payload: NotifyPayload
): Promise<PushResult[]> {
  const tasks = tokens.map((t) => dispatchOne(env, t, payload))
  return Promise.all(tasks)
}

async function dispatchOne(
  env: Env,
  token: PushToken,
  payload: NotifyPayload
): Promise<PushResult> {
  try {
    switch (token.channel) {
      case 'bark':
        return await sendBark(token.tokenValue, payload)
      case 'fcm':
        return await sendFcm(env, token.tokenValue, payload)
      case 'telegram':
        return await sendTelegram(env, token.tokenValue, payload)
      case 'email':
        return await sendEmail(env, token.tokenValue, payload)
      case 'whatsapp':
      case 'sms':
        return { channel: token.channel, ok: false, detail: 'not_implemented' }
      default:
        return {
          channel: token.channel,
          ok: false,
          detail: 'unknown_channel',
        }
    }
  } catch (err) {
    return {
      channel: token.channel,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
