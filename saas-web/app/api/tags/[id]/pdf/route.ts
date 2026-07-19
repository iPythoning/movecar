import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { movecarTags } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const QR_SIZE = 420

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const [tag] = await db
    .select({ id: movecarTags.id, shortCode: movecarTags.shortCode, plateNumber: movecarTags.plateNumber })
    .from(movecarTags)
    .where(and(eq(movecarTags.id, id), eq(movecarTags.userId, session.user.id)))
    .limit(1)
  if (!tag) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  const workerUrl =
    process.env.MOVECAR_WORKER_URL ??
    process.env.NEXT_PUBLIC_WORKER_URL ??
    'https://t.autoglobalai.com'
  const qrResponse = await fetch(
    `${workerUrl.replace(/\/$/, '')}/api/qr/${encodeURIComponent(tag.shortCode)}?size=640&ec=H`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!qrResponse.ok) {
    return NextResponse.json({ ok: false, error: 'qr_unavailable' }, { status: 502 })
  }

  try {
    const pdf = buildMoveCarPdf(await qrResponse.text(), tag.shortCode, tag.plateNumber)
    const filename = `movecar-${tag.shortCode}.pdf`
    const body = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength
    ) as ArrayBuffer
    return new Response(body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[movecar/pdf] failed to build PDF:', error)
    return NextResponse.json({ ok: false, error: 'pdf_generation_failed' }, { status: 502 })
  }
}

function buildMoveCarPdf(svg: string, shortCode: string, plateNumber: string | null): Uint8Array {
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>/g)]
  if (!viewBox || rects.length === 0) throw new Error('invalid QR SVG')

  const svgSize = Number(viewBox[1])
  const scale = QR_SIZE / svgSize
  const qrX = (PAGE_WIDTH - QR_SIZE) / 2
  const qrY = 205
  const content: string[] = [
    'q',
    '1 1 1 rg',
    `${fmt(qrX - 10)} ${fmt(qrY - 10)} ${fmt(QR_SIZE + 20)} ${fmt(QR_SIZE + 20)} re f`,
    '0 0 0 rg',
  ]
  for (const match of rects) {
    const x = qrX + Number(match[1]) * scale
    const y = qrY + QR_SIZE - (Number(match[2]) + Number(match[4])) * scale
    content.push(`${fmt(x)} ${fmt(y)} ${fmt(Number(match[3]) * scale)} ${fmt(Number(match[4]) * scale)} re f`)
  }
  content.push(
    'BT /F1 24 Tf 0 0 0 rg',
    `72 760 Td (${pdfText('MoveCar parking tag')}) Tj`,
    '0 -32 Td /F1 13 Tf',
    `(${pdfText(plateNumber ? `Vehicle: ${plateNumber}` : `Code: ${shortCode}`)}) Tj`,
    '0 -20 Td',
    `(${pdfText(`Scan code: ${shortCode}`)}) Tj`,
    'ET'
  )
  return makePdf(content.join('\n'))
}

function pdfText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')
}

function fmt(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '')
}

function makePdf(content: string): Uint8Array {
  const encoder = new TextEncoder()
  const stream = `${content}\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(encoder.encode(output).length)
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = encoder.encode(output).length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index++) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encoder.encode(output)
}
