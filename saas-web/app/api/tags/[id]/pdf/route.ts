import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { movecarPdfConfig } from '@/config/movecar-pdf'
import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { getDatabaseRequestScope } from '@/lib/db/request'
import { movecarTags } from '@/lib/db/schema'
import { buildMoveCarPdf, loadPdfFont, PdfInputError, pdfLocale, pdfQrUrl } from '@/lib/movecar/pdf'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const [tag] = await db
    .select({ shortCode: movecarTags.shortCode, plateNumber: movecarTags.plateNumber, templateId: movecarTags.templateId })
    .from(movecarTags)
    .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, session.user.id)))
    .limit(1)
  if (!tag) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  try {
    const locale = pdfLocale(request)
    const url = pdfQrUrl(tag.shortCode, getDatabaseRequestScope()?.env ?? process.env)
    const qrResponse = await fetch(url, { signal: AbortSignal.timeout(movecarPdfConfig.qr.timeoutMs) })
    if (!qrResponse.ok) return NextResponse.json({ ok: false, error: 'qr_unavailable' }, { status: 502 })
    const pdf = await buildMoveCarPdf(await qrResponse.text(), tag, locale, await loadPdfFont())
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
    return new Response(body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="movecar-${tag.shortCode}.pdf"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof PdfInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 422 })
    }
    console.error('[movecar/pdf] failed to build PDF:', error)
    return NextResponse.json({ ok: false, error: 'pdf_generation_failed' }, { status: 502 })
  }
}
