import type { Context } from 'hono'

import type { Env } from '../index'
import { html } from '../lib/html'
import { getMessages, pickLocale } from '../lib/i18n'
import { fetchTagMetadata } from '../lib/saas-client'
import {
  renderExpiredPage,
  renderScanPage,
} from '../templates/scan-page'

const TAG_CACHE_TTL_SECONDS = 60

const AUTOGLOBAL_URL = 'https://autoglobal.ai'

interface CachedTag {
  tagId: string
  ownerId: string
  isActive: boolean
  planType: string
  templateId: string
  delaySeconds: number
  cachedAt: number
}

export async function handleScan(c: Context<{ Bindings: Env }>) {
  const shortCode = c.req.param('shortCode')
  if (!shortCode || shortCode.length > 32) {
    return c.notFound()
  }

  const locale = pickLocale(c.req.header('accept-language'))
  const messages = getMessages(locale)

  // cache hit?
  const cacheKey = `tag:${shortCode}`
  let tag: CachedTag | null = null
  try {
    const cached = await c.env.MOVECAR_KV.get(cacheKey, 'json')
    if (cached) tag = cached as CachedTag
  } catch {
    // KV miss, ignore
  }

  if (!tag) {
    const fresh = await fetchTagMetadata(c.env, shortCode)
    if (!fresh) {
      return html(
        renderExpiredPage({
          locale,
          messages,
          saasUrl: c.env.SAAS_API_URL,
        }),
        404
      )
    }
    tag = { ...fresh, cachedAt: Math.floor(Date.now() / 1000) }
    // fire-and-forget cache (executionCtx is Worker-only; skip when absent)
    try {
      c.executionCtx.waitUntil(
        c.env.MOVECAR_KV.put(cacheKey, JSON.stringify(tag), {
          expirationTtl: TAG_CACHE_TTL_SECONDS,
        })
      )
    } catch {
      // ignore in non-Worker environments (tests / Node)
    }
  }

  if (!tag.isActive) {
    return html(
      renderExpiredPage({ locale, messages, saasUrl: c.env.SAAS_API_URL }),
      410
    )
  }

  return html(
    renderScanPage({
      shortCode,
      locale,
      messages,
      autoglobalUrl: AUTOGLOBAL_URL,
      templateId: tag.templateId,
    })
  )
}
