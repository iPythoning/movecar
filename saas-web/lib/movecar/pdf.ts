import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import { movecarPdfConfig as config, type PdfLocale } from '../../config/movecar-pdf'
import { getDatabaseRequestScope } from '../db/request'
import { TEMPLATE_IDS, type TemplateId } from './validations'

type PrintableTag = { shortCode: string; plateNumber: string | null; templateId: string }
type AssetsBinding = { fetch(request: Request): Promise<Response> }

export class PdfInputError extends Error {}

export function pdfLocale(request: Request): PdfLocale {
  const requested = new URL(request.url).searchParams.get('locale')
  if (requested !== null) {
    if (!Object.hasOwn(config.copy, requested)) throw new PdfInputError('invalid_locale')
    return requested as PdfLocale
  }
  for (const language of (request.headers.get('accept-language') ?? '').split(',')) {
    const locale = language.trim().split(/[;-]/)[0].toLowerCase()
    if (Object.hasOwn(config.copy, locale)) return locale as PdfLocale
  }
  return config.defaultLocale
}

export function pdfQrUrl(shortCode: string, env: Record<string, unknown>): URL {
  const value = env.MOVECAR_WORKER_URL ?? env.NEXT_PUBLIC_WORKER_URL
  if (typeof value !== 'string' || !value.trim()) throw new Error('PDF QR origin is required')
  const origin = new URL(value)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PDF QR origin must be an HTTP(S) origin')
  }
  const url = new URL(`/api/qr/${encodeURIComponent(shortCode)}`, origin)
  url.searchParams.set('size', String(config.qr.requestSize))
  url.searchParams.set('ec', config.qr.correction)
  return url
}

export async function loadPdfFont(): Promise<Uint8Array> {
  const scope = getDatabaseRequestScope()
  if (scope) {
    const binding = scope.env[config.font.assetBinding]
    if (!binding || typeof binding !== 'object' || !('fetch' in binding) || typeof binding.fetch !== 'function') {
      throw new Error('PDF font asset binding is required')
    }
    const origin = scope.env.NEXT_PUBLIC_SITE_URL
    if (typeof origin !== 'string' || !origin) throw new Error('PDF asset origin is required')
    const response = await (binding as AssetsBinding).fetch(new Request(new URL(config.font.assetPath, origin)))
    if (!response.ok) throw new Error('PDF font asset is unavailable')
    return new Uint8Array(await response.arrayBuffer())
  }
  if (process.env.MOVECAR_RUNTIME === 'cloudflare') throw new Error('PDF assets require a request scope')
  return readFile(path.join(process.cwd(), 'public', config.font.assetPath))
}

export async function buildMoveCarPdf(svg: string, tag: PrintableTag, locale: PdfLocale, fontBytes: Uint8Array): Promise<Uint8Array> {
  if (!TEMPLATE_IDS.includes(tag.templateId as TemplateId)) throw new PdfInputError('invalid_template')
  const template = config.templates[tag.templateId as TemplateId]
  const copy = config.copy[locale]
  const qr = parseQrSvg(svg)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true, customName: config.font.pdfName })
  const vehicle = tag.plateNumber ? `${copy.vehicle}: ${tag.plateNumber}` : `${copy.code}: ${tag.shortCode}`
  const code = `${copy.code}: ${tag.shortCode}`
  const texts = ['MoveCar', copy.title, vehicle, code, copy.privacy, ...copy.instructions]
  const characters = new Set(font.getCharacterSet())
  if (texts.some(text => [...text].some(character => !characters.has(character.codePointAt(0)!)))) {
    throw new PdfInputError('unsupported_print_character')
  }
  const page = pdf.addPage([config.page.width, config.page.height])
  const x = (config.page.width - config.card.width) / 2
  const innerWidth = config.card.width - config.card.inset * 2
  const top = config.card.bottom + config.card.height
  page.drawRectangle({ x, y: config.card.bottom, width: config.card.width, height: config.card.height,
    borderColor: rgb(0, 0, 0), borderWidth: template.borderWidth })
  if (template.headerFill) {
    page.drawRectangle({ x, y: config.text.brandBottom - config.card.inset / 2,
      width: config.card.width, height: top - config.text.brandBottom + config.card.inset / 2, color: rgb(0, 0, 0) })
  }
  if (template.car) drawCar(page, config.page.width / 2, config.text.brandBottom, template.carUnit)
  else centeredText(page, font, 'MoveCar', config.text.brandSize, config.text.brandBottom, innerWidth, template.headerFill)
  centeredText(page, font, copy.title, config.text.titleSize, config.text.titleBottom, innerWidth)
  centeredText(page, font, vehicle, config.text.vehicleSize, config.text.vehicleBottom, innerWidth)
  const qrX = (config.page.width - config.qr.size) / 2
  const scale = config.qr.size / qr.size
  page.drawRectangle({ x: qrX, y: config.qr.bottom, width: config.qr.size, height: config.qr.size, color: rgb(1, 1, 1) })
  for (const rect of qr.rects) {
    page.drawRectangle({ x: qrX + rect.x * scale, y: config.qr.bottom + config.qr.size - (rect.y + rect.height) * scale,
      width: rect.width * scale, height: rect.height * scale, color: rgb(0, 0, 0) })
  }
  centeredText(page, font, code, config.text.codeSize, config.text.codeBottom, innerWidth)
  centeredText(page, font, copy.privacy, config.text.privacySize, config.text.privacyBottom, innerWidth)
  copy.instructions.forEach((text, index) => centeredText(page, font, text, config.text.instructionSize,
    config.text.instructionBottom - index * config.text.instructionLineHeight, config.page.width - config.card.inset * 2))
  pdf.setTitle(`MoveCar ${tag.templateId}`)
  pdf.setSubject('Printable parking notification code')
  return pdf.save()
}

function centeredText(page: PDFPage, font: PDFFont, text: string, preferredSize: number, y: number, maximumWidth: number, white = false) {
  const size = Math.min(preferredSize, preferredSize * maximumWidth / font.widthOfTextAtSize(text, preferredSize))
  if (size < config.text.minimumSize) throw new PdfInputError('print_text_too_long')
  page.drawText(text, { font, size, x: (config.page.width - font.widthOfTextAtSize(text, size)) / 2, y,
    color: white ? rgb(1, 1, 1) : rgb(0, 0, 0) })
}

function drawCar(page: PDFPage, center: number, y: number, unit: number) {
  const black = rgb(0, 0, 0)
  page.drawRectangle({ x: center - unit * 2, y, width: unit * 4, height: unit,
    borderColor: black, borderWidth: config.templates.cartoon.borderWidth })
  page.drawLine({ start: { x: center - unit * 1.5, y: y + unit }, end: { x: center - unit, y: y + unit * 1.7 }, color: black })
  page.drawLine({ start: { x: center - unit, y: y + unit * 1.7 }, end: { x: center + unit, y: y + unit * 1.7 }, color: black })
  page.drawLine({ start: { x: center + unit, y: y + unit * 1.7 }, end: { x: center + unit * 1.5, y: y + unit }, color: black })
  for (const side of [-1, 1]) page.drawCircle({ x: center + side * unit * 1.3, y, size: unit / 3,
    color: rgb(1, 1, 1), borderColor: black, borderWidth: config.templates.cartoon.borderWidth })
}

function parseQrSvg(svg: string) {
  const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }))
  const size = Number(box?.[1])
  if (!box || !Number.isFinite(size) || size <= 0 || size !== Number(box[2]) || !rects.length ||
      rects.some(rect => !Object.values(rect).every(Number.isFinite) || rect.x < 0 || rect.y < 0 ||
        rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > size || rect.y + rect.height > size)) {
    throw new Error('Invalid QR SVG')
  }
  return { size, rects }
}
