import type { TemplateId } from '../lib/movecar/validations'
import fontSource from '../public/fonts/SOURCE.json'

export const movecarPdfConfig = {
  page: { width: 595.28, height: 841.89 },
  card: { width: 340, height: 442, bottom: 260, inset: 18 },
  qr: { size: 224, bottom: 380, requestSize: 640, correction: 'H', timeoutMs: 10_000 },
  text: {
    brandSize: 12, brandBottom: 678, titleSize: 22, titleBottom: 642,
    vehicleSize: 14, vehicleBottom: 616, codeSize: 11, codeBottom: 354,
    privacySize: 11, privacyBottom: 330, instructionSize: 11,
    instructionBottom: 232, instructionLineHeight: 19, minimumSize: 9,
  },
  font: {
    assetPath: '/fonts/MoveCarPrint-Regular.ttf',
    source: fontSource.source,
    sha256: fontSource.sha256,
    pdfName: 'MOVCAR+MoveCarPrint-Regular',
    assetBinding: 'ASSETS',
  },
  defaultLocale: 'en',
  copy: {
    en: {
      title: 'Need me to move my car?', vehicle: 'Vehicle', code: 'Parking code',
      privacy: 'Scan to notify me. My phone number stays private.',
      instructions: ['Print at 100% / actual size, then cut along the border.', 'Place inside the windshield with the code facing out.', 'Test a scan from outside before leaving your car.'],
    },
    zh: {
      title: '需要挪車？掃碼通知我', vehicle: '車牌', code: '挪車碼',
      privacy: '掃碼通知車主，不公開手機號碼。',
      instructions: ['以 100%／實際尺寸列印，沿邊框裁剪。', '放在擋風玻璃內側，讓二維碼朝外。', '停車離開前，先從車外試掃一次。'],
    },
    ja: {
      title: '移動が必要ですか？', vehicle: 'ナンバー', code: '駐車コード',
      privacy: 'スキャンして連絡。電話番号は公開されません。',
      instructions: ['100%／実際のサイズで印刷し、枠に沿って切ります。', 'フロントガラスの内側に、コードを外向きに置きます。', '車を離れる前に、車外から読み取りを確認してください。'],
    },
  },
  templates: {
    classic: { borderWidth: 2, headerFill: true, car: false, carUnit: 0 },
    minimal: { borderWidth: 0.5, headerFill: false, car: false, carUnit: 0 },
    cartoon: { borderWidth: 1.5, headerFill: false, car: true, carUnit: 12 },
  } satisfies Record<TemplateId, { borderWidth: number; headerFill: boolean; car: boolean; carUnit: number }>,
} as const

export type PdfLocale = keyof typeof movecarPdfConfig.copy
