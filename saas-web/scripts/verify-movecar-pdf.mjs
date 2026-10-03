import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import upng from '@pdf-lib/upng'

import { movecarPdfConfig as config } from '../config/movecar-pdf.ts'
import { buildMoveCarPdf, loadPdfFont, pdfLocale, pdfQrUrl } from '../lib/movecar/pdf.ts'
import { TEMPLATE_IDS } from '../lib/movecar/validations.ts'
import { handleQr } from '../../worker/src/routes/qr.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const UPNG = upng.default
const output = path.resolve(root, process.argv[2] ?? '.temp/pdf-verification')
const fixture = {
  scanOrigin: 'https://scan.fixture.invalid', siteOrigin: 'https://pdf.fixture.invalid', shortCode: 'printQR01',
  plates: { en: 'SYNTHETIC-01', zh: '沪A·測試', ja: '品川 500 あ12-34' },
  startupMs: 60_000, requestMs: 30_000, shutdownMs: 5_000, rasterDpi: 150,
}
mkdirSync(output, { recursive: true })
const font = await loadPdfFont()
const rasterFont = fontkit.create(font)
assert.equal(createHash('sha256').update(font).digest('hex'), config.font.sha256)
assert.deepEqual(Object.keys(config.templates), [...TEMPLATE_IDS])
assert.throws(() => pdfLocale(new Request(`${fixture.siteOrigin}/?locale=../../zh`)), /invalid_locale/)
assert.throws(() => pdfQrUrl(fixture.shortCode, {}), /origin is required/)
assert.throws(() => pdfQrUrl(fixture.shortCode, { MOVECAR_WORKER_URL: `${fixture.scanOrigin}/wrong` }), /HTTP\(S\) origin/)
assert.equal(pdfLocale(new Request(`${fixture.siteOrigin}/?locale=ja`, { headers: { 'accept-language': 'zh' } })), 'ja')
const svg = await handleQr({ req: {
  param: () => fixture.shortCode, query: key => key === 'ec' ? config.qr.correction : String(config.qr.requestSize),
  url: pdfQrUrl(fixture.shortCode, { MOVECAR_WORKER_URL: fixture.scanOrigin }).href,
} }).text()
await assert.rejects(buildMoveCarPdf(svg, { shortCode: fixture.shortCode, plateNumber: '🙂', templateId: 'classic' }, 'en', font), /unsupported_print_character/)
await assert.rejects(buildMoveCarPdf(svg, { shortCode: fixture.shortCode, plateNumber: null, templateId: 'unknown' }, 'en', font), /invalid_template/)
await assert.rejects(buildMoveCarPdf('<svg/>', { shortCode: fixture.shortCode, plateNumber: null, templateId: 'classic' }, 'en', font), /Invalid QR SVG/)

async function verify(bytes, template, locale, runtime) {
  const name = `${runtime}-${template}-${locale}`
  const filename = path.join(output, `${name}.pdf`)
  writeFileSync(filename, bytes)
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 1)
  assert.deepEqual(pdf.getPage(0).getSize(), config.page)
  const text = execFileSync('pdftotext', [filename, '-'], { encoding: 'utf8' })
  assert.ok(text.includes(fixture.plates[locale]), `${name}: vehicle text must survive extraction`)
  assert.ok(text.includes(config.copy[locale].title), `${name}: localized title must survive extraction`)
  assert.ok(text.includes(fixture.shortCode))
  assert.ok(!text.includes('@') && !text.includes('tel:'))
  const fonts = execFileSync('pdffonts', [filename], { encoding: 'utf8' })
  assert.match(fonts, /yes\s+yes\s+yes/, `${name}: font must be embedded, subset and Unicode mapped`)
  const raster = path.join(output, name)
  execFileSync('pdftoppm', ['-singlefile', '-gray', '-png', '-r', String(fixture.rasterDpi), filename, raster], { stdio: 'pipe' })
  verifyVisibleGlyphs(readFileSync(`${raster}.png`), template, locale)
  if (runtime === 'node' && template === 'classic' && locale === 'zh') {
    const png = readFileSync(`${raster}.png`)
    const image = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength))
    const rgba = new Uint8Array(UPNG.toRGBA8(image)[0])
    const scale = fixture.rasterDpi / 72
    const top = Math.floor((config.page.height - config.text.titleBottom - config.text.titleSize) * scale)
    const bottom = Math.ceil((config.page.height - config.text.titleBottom + config.text.titleSize / 4) * scale)
    for (let y = top; y <= bottom; y++) rgba.fill(255, y * image.width * 4, (y + 1) * image.width * 4)
    const missingTitle = new Uint8Array(UPNG.encode([rgba.buffer], image.width, image.height, 0))
    assert.throws(() => verifyVisibleGlyphs(missingTitle, template, locale), /missing from rendered text/)
  }
  const decoded = execFileSync('zbarimg', ['--quiet', '--raw', `${raster}.png`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  assert.equal(decoded, `${fixture.scanOrigin}/t/${fixture.shortCode}`, `${name}: QR target must remain unchanged`)
  return bytes.length
}

function verifyVisibleGlyphs(png, template, locale) {
  const decoded = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength))
  const pixels = new Uint8Array(UPNG.toRGBA8(decoded)[0])
  const copy = config.copy[locale]
  const innerWidth = config.card.width - config.card.inset * 2
  const lines = [
    { text: copy.title, size: config.text.titleSize, y: config.text.titleBottom, width: innerWidth },
    { text: `${copy.vehicle}: ${fixture.plates[locale]}`, size: config.text.vehicleSize, y: config.text.vehicleBottom, width: innerWidth },
    { text: `${copy.code}: ${fixture.shortCode}`, size: config.text.codeSize, y: config.text.codeBottom, width: innerWidth },
    { text: copy.privacy, size: config.text.privacySize, y: config.text.privacyBottom, width: innerWidth },
    ...copy.instructions.map((text, index) => ({ text, size: config.text.instructionSize,
      y: config.text.instructionBottom - index * config.text.instructionLineHeight, width: config.page.width - config.card.inset * 2 })),
  ]
  if (!config.templates[template].car) lines.push({ text: 'MoveCar', size: config.text.brandSize,
    y: config.text.brandBottom, width: innerWidth, white: config.templates[template].headerFill })
  const scale = fixture.rasterDpi / 72
  for (const line of lines) {
    const glyphs = rasterFont.layout(line.text).glyphs
    const emWidth = glyphs.reduce((total, glyph) => total + glyph.advanceWidth, 0)
    const size = Math.min(line.size, line.width * rasterFont.unitsPerEm / emWidth)
    const glyphScale = size / rasterFont.unitsPerEm
    let x = (config.page.width - emWidth * glyphScale) / 2
    for (const glyph of glyphs) {
      const box = glyph.bbox
      if (box.maxX > box.minX && box.maxY > box.minY) {
        const left = Math.max(0, Math.floor((x + box.minX * glyphScale) * scale))
        const right = Math.min(decoded.width - 1, Math.ceil((x + box.maxX * glyphScale) * scale))
        const top = Math.max(0, Math.floor((config.page.height - line.y - box.maxY * glyphScale) * scale))
        const bottom = Math.min(decoded.height - 1, Math.ceil((config.page.height - line.y - box.minY * glyphScale) * scale))
        let ink = 0
        for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
          const intensity = pixels[(py * decoded.width + px) * 4]
          if (line.white ? intensity > 200 : intensity < 80) ink++
        }
        assert.ok(ink > 2, `${template}/${locale}: glyph ${glyph.id} is missing from rendered text ${line.text}`)
      }
      x += glyph.advanceWidth * glyphScale
    }
  }
}

const results = []
for (const template of TEMPLATE_IDS) {
  for (const locale of Object.keys(fixture.plates)) {
    const bytes = await buildMoveCarPdf(svg, { shortCode: fixture.shortCode, plateNumber: fixture.plates[locale], templateId: template }, locale, font)
    results.push({ runtime: 'node', template, locale, bytes: await verify(bytes, template, locale, 'node') })
  }
}

const temporary = mkdtempSync(path.join(output, 'worker-fixture-'))
let child
let exited
try {
  writeFileSync(path.join(temporary, 'worker.ts'), `
import { buildMoveCarPdf, loadPdfFont } from ${JSON.stringify(path.join(root, 'lib/movecar/pdf.ts'))};
import { withDatabaseRequest } from ${JSON.stringify(path.join(root, 'lib/db/request.ts'))};
export default { fetch(request, env, ctx) {
  return withDatabaseRequest(env, promise => ctx.waitUntil(promise), async () => {
    const url = new URL(request.url);
    const payload = await request.json();
    const bytes = await buildMoveCarPdf(payload.svg, payload.tag, url.searchParams.get('locale'), await loadPdfFont());
    return new Response(bytes, { headers: { 'content-type': 'application/pdf' } });
  });
} };
`)
  const cf = JSON.parse(readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'))
  const workerConfig = path.join(temporary, 'wrangler.json')
  writeFileSync(workerConfig, JSON.stringify({
    name: 'movecar-pdf-offline-fixture', main: 'worker.ts', compatibility_date: cf.compatibility_date,
    compatibility_flags: cf.compatibility_flags, assets: { directory: path.join(root, 'public'), binding: config.font.assetBinding, run_worker_first: true },
    vars: { MOVECAR_RUNTIME: 'cloudflare', NEXT_PUBLIC_SITE_URL: fixture.siteOrigin },
  }))
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  child = fork(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), [
    'dev', '--config', workerConfig, '--local', '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0',
    '--log-level', 'error', '--no-types', '--no-show-interactive-dev-session',
  ], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  child.stdout.on('data', data => process.stdout.write(data))
  child.stderr.on('data', data => process.stderr.write(data))
  exited = new Promise(resolve => child.once('exit', resolve))
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PDF fixture workerd startup timed out')), fixture.startupMs)
    const fail = () => { clearTimeout(timer); reject(new Error('PDF fixture workerd exited before readiness')) }
    child.once('error', fail)
    child.once('exit', fail)
    child.on('message', message => {
      try {
        const ready = typeof message === 'string' ? JSON.parse(message) : message
        if (ready?.event !== 'DEV_SERVER_READY') return
        assert.equal(ready.ip, '127.0.0.1')
        assert.ok(Number.isInteger(ready.port) && ready.port > 0)
        clearTimeout(timer)
        child.removeListener('error', fail)
        child.removeListener('exit', fail)
        resolve(`http://127.0.0.1:${ready.port}`)
      } catch (error) { clearTimeout(timer); reject(error) }
    })
  })
  for (const template of TEMPLATE_IDS) {
    for (const locale of Object.keys(fixture.plates)) {
      const start = performance.now()
      const response = await fetch(`${origin}/?locale=${locale}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ svg, tag: { shortCode: fixture.shortCode, plateNumber: fixture.plates[locale], templateId: template } }),
        signal: AbortSignal.timeout(fixture.requestMs) })
      assert.equal(response.status, 200, await response.clone().text())
      assert.equal(response.headers.get('content-type'), 'application/pdf')
      const bytes = new Uint8Array(await response.arrayBuffer())
      const elapsedMs = Math.round(performance.now() - start)
      results.push({ runtime: 'workerd', template, locale, bytes: await verify(bytes, template, locale, 'workerd'), elapsedMs })
    }
  }
  writeFileSync(path.join(output, 'results.json'), `${JSON.stringify({ fontSha256: config.font.sha256, rasterDpi: fixture.rasterDpi, results }, null, 2)}\n`)
  console.log(JSON.stringify({ passed: results.length, runtimes: ['node', 'workerd'], unicode: true, visibleGlyphs: true,
    missingGlyphRegression: true, embeddedSubsetFont: true, grayscaleQrDecoded: true, output }))
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    let timer
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, fixture.shutdownMs) })])
    clearTimeout(timer)
  }
  rmSync(temporary, { recursive: true, force: true })
}
