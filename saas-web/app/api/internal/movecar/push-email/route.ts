import { NextResponse } from 'next/server'
import { z } from 'zod'

import resend from '@/lib/resend'
import { getErrorMessage } from '@/lib/error-utils'
import { verifyInternalRequest } from '@/lib/movecar/internal-auth'

/**
 * Internal endpoint used by the Cloudflare Worker to delegate email delivery
 * to the SaaS side, where Resend is already configured.
 *
 * Request body (HMAC-signed by Worker):
 *   {
 *     to: string,
 *     subject: string,
 *     html: string,
 *     text?: string
 *   }
 */

const pushEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
})

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const rawBody = await req.text()
  const auth = await verifyInternalRequest(req, rawBody)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? 'unauthorized' },
      { status: 401 }
    )
  }

  let parsed: z.infer<typeof pushEmailSchema>
  try {
    parsed = pushEmailSchema.parse(JSON.parse(rawBody))
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 400 }
    )
  }

  if (!resend) {
    return NextResponse.json(
      { ok: false, error: 'resend_not_configured' },
      { status: 503 }
    )
  }

  const senderEmail = process.env.ADMIN_EMAIL
  if (!senderEmail) {
    return NextResponse.json(
      { ok: false, error: 'admin_email_not_configured' },
      { status: 503 }
    )
  }

  try {
    const { error } = await resend.emails.send({
      from: `${process.env.ADMIN_NAME ?? 'MoveCar'} <${senderEmail}>`,
      to: parsed.to,
      subject: parsed.subject,
      html: parsed.html,
      text: parsed.text,
    })

    if (error) {
      console.error('[movecar/push-email] Resend error:', error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[movecar/push-email] failed:', error)
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
