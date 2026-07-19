/**
 * MoveCar Pricing Configuration
 * MoveCar 定价配置文件
 *
 * Single source of truth for MoveCar SaaS pricing plans.
 * AI can edit this file directly, then run `pnpm db:seed` to sync to database.
 *
 * 本文件作为 MoveCar SaaS 定价计划的单一真相来源。
 * 可以直接编辑后运行 `pnpm db:seed` 同步到数据库。
 *
 * Setup required environment variables:
 * - STRIPE_PRICE_ID_PRO_MONTHLY
 * - STRIPE_PRICE_ID_PRO_YEARLY
 * - STRIPE_PRICE_ID_LIFETIME
 * - STRIPE_PRODUCT_ID_PRO_MONTHLY  (optional, for metadata)
 * - STRIPE_PRODUCT_ID_PRO_YEARLY   (optional)
 * - STRIPE_PRODUCT_ID_LIFETIME     (optional)
 *
 * For China checkout routing via Creem, also set:
 * - CREEM_PRODUCT_ID_PRO_MONTHLY
 * - CREEM_PRODUCT_ID_PRO_YEARLY
 * - CREEM_PRODUCT_ID_LIFETIME
 */

import type { InferInsertModel } from 'drizzle-orm'
import {
  pricingPlanGroups as pricingPlanGroupsTable,
  pricingPlans as pricingPlansTable,
} from '../schema'

export type PricingPlanConfig = Omit<
  InferInsertModel<typeof pricingPlansTable>,
  'createdAt' | 'updatedAt'
>

export type PricingGroupConfig = Omit<
  InferInsertModel<typeof pricingPlanGroupsTable>,
  'createdAt'
>

export interface PricingFeature {
  description: string
  included: boolean
  bold?: boolean
  href?: string
}

export interface LocalizedPricingContent {
  cardTitle?: string
  cardDescription?: string
  displayPrice?: string
  originalPrice?: string
  priceSuffix?: string
  highlightText?: string
  buttonText?: string
  currency?: string
  features?: PricingFeature[]
}

export interface PricingBenefits {
  movecarPlanType?: 'free' | 'pro_monthly' | 'pro_yearly' | 'lifetime'
  oneTimeCredits?: number
  monthlyCredits?: number
  totalMonths?: number
  [key: string]: unknown
}

// ============================================================================
// Pricing Groups
// ============================================================================

export const pricingGroups: PricingGroupConfig[] = [
  { slug: 'free' },
  { slug: 'monthly' },
  { slug: 'onetime' },
]

// ============================================================================
// Pricing Plans
// ============================================================================

const freeFeatures: PricingFeature[] = [
  { included: true, description: '1 tag (vehicle)' },
  { included: true, description: '30 notifications / month' },
  { included: true, description: 'Bark + Email push channels' },
  { included: true, description: '3 basic QR templates' },
  { included: false, description: 'Multi-channel push (FCM/Telegram/WhatsApp/SMS)' },
  { included: false, description: 'Scan heatmap & analytics' },
]

const proFeatures: PricingFeature[] = [
  { included: true, description: '10 tags (vehicles)' },
  { included: true, description: 'Unlimited notifications' },
  { included: true, description: 'All push channels: Bark / FCM / Telegram / Email' },
  { included: true, description: '30+ QR templates' },
  { included: true, description: '180-day notification history' },
  { included: true, description: 'Scan heatmap & analytics' },
]

const lifetimeFeatures: PricingFeature[] = [
  { included: true, description: 'Unlimited tags (vehicles)' },
  { included: true, description: 'Unlimited notifications, forever' },
  { included: true, description: 'All push channels: Bark / FCM / Telegram / Email' },
  { included: true, description: 'All QR templates + early access to new ones' },
  { included: true, description: 'Permanent notification history' },
  { included: true, description: 'Scan heatmap & analytics' },
]

export const pricingPlans: PricingPlanConfig[] = [
  {
    id: 'e0524810-9035-461e-9344-0b3827bcca3d',
    environment: (process.env.PRICING_ENVIRONMENT as 'test' | 'live') || 'test',
    groupSlug: 'monthly',
    cardTitle: 'Free',
    cardDescription: 'Privacy-first parking notice for one vehicle.',
    provider: 'none',
    paymentType: 'one_time',
    recurringInterval: null,
    price: '0',
    currency: 'USD',
    displayPrice: '$0',
    priceSuffix: '/mo',
    features: freeFeatures,
    isHighlighted: false,
    highlightText: '',
    buttonText: 'Get Started',
    displayOrder: 0,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Free',
        cardDescription: 'Privacy-first parking notice for one vehicle.',
        displayPrice: '$0',
        priceSuffix: '/mo',
        buttonText: 'Get Started',
        features: freeFeatures,
      },
      zh: {
        cardTitle: '免费版',
        cardDescription: '保护隐私的单车挪车通知服务。',
        displayPrice: '$0',
        priceSuffix: '/月',
        buttonText: '免费开始',
        features: [
          { included: true, description: '1 个车辆 Tag' },
          { included: true, description: '每月 30 条通知' },
          { included: true, description: 'Bark + 邮件推送' },
          { included: true, description: '3 款基础二维码模板' },
          { included: false, description: '多通道推送（FCM/Telegram/WhatsApp/SMS）' },
          { included: false, description: '扫码热力图与数据分析' },
        ],
      },
    },
    benefitsJsonb: {
      movecarPlanType: 'free',
    } as PricingBenefits,
  },
  {
    id: 'acce26dc-7103-4a1b-bad2-aff0e2398239',
    environment: (process.env.PRICING_ENVIRONMENT as 'test' | 'live') || 'test',
    groupSlug: 'monthly',
    cardTitle: 'Pro Monthly',
    cardDescription: 'Full multi-channel coverage for daily drivers.',
    provider: 'stripe',
    stripePriceId:
      process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_1TuCdvJ0sxpFhqdN8qkm5hJV',
    stripeProductId:
      process.env.STRIPE_PRODUCT_ID_PRO_MONTHLY || 'prod_Uu0e7cvIjSjql8',
    paymentType: 'recurring',
    recurringInterval: 'month',
    price: '1',
    currency: 'USD',
    displayPrice: '$1.00',
    originalPrice: '',
    priceSuffix: '/mo',
    features: proFeatures,
    isHighlighted: false,
    highlightText: '',
    buttonText: 'Subscribe Monthly',
    displayOrder: 1,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Pro Monthly',
        cardDescription: 'Full multi-channel coverage for daily drivers.',
        displayPrice: '$1.00',
        priceSuffix: '/mo',
        buttonText: 'Subscribe Monthly',
        features: proFeatures,
      },
      zh: {
        cardTitle: '专业版月付',
        cardDescription: '全通道挪车通知，适合日常用车。',
        displayPrice: '$1.00',
        priceSuffix: '/月',
        buttonText: '按月订阅',
        features: [
          { included: true, description: '10 个车辆 Tag' },
          { included: true, description: '无限条通知' },
          { included: true, description: '全通道推送：Bark / FCM / Telegram / 邮件' },
          { included: true, description: '30+ 款二维码模板' },
          { included: true, description: '180 天通知历史' },
          { included: true, description: '扫码热力图与数据分析' },
        ],
      },
    },
    benefitsJsonb: {
      movecarPlanType: 'pro_monthly',
    } as PricingBenefits,
  },
  {
    id: '5c83c82b-37e8-406e-9f39-cafcab459e2d',
    environment: (process.env.PRICING_ENVIRONMENT as 'test' | 'live') || 'test',
    groupSlug: 'onetime',
    cardTitle: 'Lifetime',
    cardDescription: 'One-time payment, forever protection.',
    provider: 'stripe',
    stripePriceId:
      process.env.STRIPE_PRICE_ID_LIFETIME || 'price_1TuCdwJ0sxpFhqdNf2s2HLvM',
    stripeProductId:
      process.env.STRIPE_PRODUCT_ID_LIFETIME || 'prod_Uu0eIb3H86AC1f',
    paymentType: 'one_time',
    recurringInterval: null,
    price: '9.9',
    currency: 'USD',
    displayPrice: '$9.90',
    originalPrice: '$29',
    priceSuffix: '/lifetime',
    features: lifetimeFeatures,
    isHighlighted: true,
    highlightText: 'Best Value',
    buttonText: 'Buy Lifetime',
    displayOrder: 3,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Lifetime',
        cardDescription: 'One-time payment, forever protection.',
        displayPrice: '$9.90',
        originalPrice: '$29',
        priceSuffix: '/lifetime',
        buttonText: 'Buy Lifetime',
        highlightText: 'Best Value',
        features: lifetimeFeatures,
      },
      zh: {
        cardTitle: '终身版',
        cardDescription: '一次付费，终身守护。',
        displayPrice: '$9.90',
        originalPrice: '$29',
        priceSuffix: '/终身',
        buttonText: '购买终身版',
        highlightText: '最划算',
        features: [
          { included: true, description: '无限个车辆 Tag' },
          { included: true, description: '无限条通知，永久有效' },
          { included: true, description: '全通道推送：Bark / FCM / Telegram / 邮件' },
          { included: true, description: '所有模板 + 新模板优先体验' },
          { included: true, description: '永久通知历史' },
          { included: true, description: '扫码热力图与数据分析' },
        ],
      },
    },
    benefitsJsonb: {
      movecarPlanType: 'lifetime',
    } as PricingBenefits,
  },
]
