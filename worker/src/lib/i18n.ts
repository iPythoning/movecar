export type Locale = 'zh' | 'en' | 'ja'

const PRIORITY: Locale[] = ['zh', 'en', 'ja']

/**
 * Pick a locale from Accept-Language header. Defaults to `en`.
 * Simplistic — good enough for edge without a parser dependency.
 */
export function pickLocale(header: string | null | undefined): Locale {
  if (!header) return 'en'
  const lower = header.toLowerCase()
  if (lower.includes('zh')) return 'zh'
  if (lower.includes('ja')) return 'ja'
  if (lower.includes('en')) return 'en'
  // fallback by priority
  for (const code of PRIORITY) {
    if (lower.includes(code)) return code
  }
  return 'en'
}

export interface Messages {
  scan: {
    title: string
    subtitle: string
    inputPlaceholder: string
    quickTags: { blocked: string; shortPark: string; noAnswer: string; urgent: string }
    myLocation: string
    locationGranted: string
    locationDenied: string
    submit: string
    waiting: string
    sentTitle: string
    sentBody: string
    expiredTitle: string
    expiredBody: string
    expiredCTA: string
    autoglobalCTATitle: string
    autoglobalCTABody: string
    autoglobalCTAButton: string
  }
  owner: {
    title: string
    subtitle: string
    requesterMessage: string
    requesterLocation: string
    quickReplies: {
      coming: string
      tenMin: string
      cannot: string
    }
    customReplyPlaceholder: string
    submit: string
    shareLocation: string
    doneTitle: string
    doneBody: string
    invalidTitle: string
    invalidBody: string
  }
}

const ZH: Messages = {
  scan: {
    title: '呼叫车主挪车',
    subtitle: '保护隐私·即时通知',
    inputPlaceholder: '输入留言给车主…（可选）',
    quickTags: {
      blocked: '🚧 挡路',
      shortPark: '⏱️ 临停',
      noAnswer: '📞 没接',
      urgent: '🙏 加急',
    },
    myLocation: '我的位置',
    locationGranted: '已获取位置 ✓',
    locationDenied: '未授权 · 30 秒后再发送',
    submit: '🔔 一键通知车主',
    waiting: '通知发送中…',
    sentTitle: '已通知车主',
    sentBody: '请耐心等待车主回应',
    expiredTitle: '此挪车码已失效',
    expiredBody: '车主的订阅已过期或挪车码已被禁用',
    expiredCTA: '查看可用方案',
    autoglobalCTATitle: '想出国买车 / 海外提车？',
    autoglobalCTABody: 'AutoGlobal.ai 一站式跨境汽车贸易平台',
    autoglobalCTAButton: '了解 AutoGlobal →',
  },
  owner: {
    title: '有人在找您',
    subtitle: 'MoveCar 通知',
    requesterMessage: '对方留言',
    requesterLocation: '对方位置',
    quickReplies: {
      coming: '🚀 我这就来',
      tenMin: '⏱️ 10 分钟内到',
      cannot: '🙇 暂时无法挪',
    },
    customReplyPlaceholder: '自定义回复…',
    submit: '发送回复',
    shareLocation: '同时分享我的位置',
    doneTitle: '已回复',
    doneBody: '对方已收到您的消息',
    invalidTitle: '链接已失效',
    invalidBody: '此确认链接已使用或已过期',
  },
}

const EN: Messages = {
  scan: {
    title: 'Notify the Car Owner',
    subtitle: 'Privacy-safe · Instant',
    inputPlaceholder: 'Leave a message for the owner… (optional)',
    quickTags: {
      blocked: '🚧 Blocking me',
      shortPark: '⏱️ Short park',
      noAnswer: '📞 No answer',
      urgent: '🙏 Urgent',
    },
    myLocation: 'My location',
    locationGranted: 'Location acquired ✓',
    locationDenied: 'Not granted · 30s delay',
    submit: '🔔 Notify the owner',
    waiting: 'Sending notification…',
    sentTitle: 'Owner notified',
    sentBody: 'Please wait for their reply',
    expiredTitle: 'This parking tag is inactive',
    expiredBody: 'The owner’s subscription has expired or the tag is disabled',
    expiredCTA: 'See plans',
    autoglobalCTATitle: 'Planning to buy a car overseas?',
    autoglobalCTABody: 'AutoGlobal.ai — cross-border vehicle trading platform',
    autoglobalCTAButton: 'Visit AutoGlobal →',
  },
  owner: {
    title: 'Someone is looking for you',
    subtitle: 'MoveCar notification',
    requesterMessage: 'Message',
    requesterLocation: 'Their location',
    quickReplies: {
      coming: '🚀 Coming right now',
      tenMin: '⏱️ Within 10 min',
      cannot: '🙇 Cannot move now',
    },
    customReplyPlaceholder: 'Custom reply…',
    submit: 'Send reply',
    shareLocation: 'Share my location too',
    doneTitle: 'Reply sent',
    doneBody: 'The requester has received your message',
    invalidTitle: 'Link expired',
    invalidBody: 'This confirmation link has been used or expired',
  },
}

const JA: Messages = {
  scan: {
    title: '車の所有者に通知',
    subtitle: 'プライバシー保護 · 即時通知',
    inputPlaceholder: 'メッセージを入力（任意）',
    quickTags: {
      blocked: '🚧 出られない',
      shortPark: '⏱️ 短時間駐車',
      noAnswer: '📞 電話不応答',
      urgent: '🙏 急ぎ',
    },
    myLocation: '現在地',
    locationGranted: '位置情報を取得 ✓',
    locationDenied: '未許可 · 30 秒後送信',
    submit: '🔔 所有者に通知',
    waiting: '送信中…',
    sentTitle: '通知を送信しました',
    sentBody: '返信をお待ちください',
    expiredTitle: 'この駐車タグは無効です',
    expiredBody: '所有者のサブスクリプションが失効しているかタグが無効化されています',
    expiredCTA: 'プランを見る',
    autoglobalCTATitle: '海外で車を買いたい方へ',
    autoglobalCTABody: 'AutoGlobal.ai クロスボーダー自動車貿易プラットフォーム',
    autoglobalCTAButton: 'AutoGlobal を見る →',
  },
  owner: {
    title: '誰かが探しています',
    subtitle: 'MoveCar 通知',
    requesterMessage: 'メッセージ',
    requesterLocation: '相手の位置',
    quickReplies: {
      coming: '🚀 すぐ行きます',
      tenMin: '⏱️ 10 分以内',
      cannot: '🙇 今は動かせません',
    },
    customReplyPlaceholder: 'カスタム返信…',
    submit: '返信送信',
    shareLocation: '私の位置も共有',
    doneTitle: '返信済み',
    doneBody: 'メッセージを送信しました',
    invalidTitle: 'リンクの有効期限切れ',
    invalidBody: 'この確認リンクは使用済みまたは期限切れです',
  },
}

export function getMessages(locale: Locale): Messages {
  return locale === 'zh' ? ZH : locale === 'ja' ? JA : EN
}

export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja' : 'en'
}
