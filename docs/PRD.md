# MoveCar PRD v3.0（最终版）

> 日期：2026-04-20 · 作者：Clark · 状态：定稿
>
> **v3.0 定位**：MoveCar 是**独立 SaaS 项目**，部署在 autoglobalai.com 子域下做品牌矩阵，与 autoglobal 主站**零代码耦合**，只做营销层互导。

---

## 0. TL;DR

- **产品**：智能挪车通知 SaaS —— 隐私优先、多渠道推送、扫码即通知
- **矩阵定位**：autoglobal 汽车业务矩阵下的**独立子产品**，品牌联动 ≠ 代码融合
- **部署**：
  - `movecar.autoglobalai.com` → Vercel（Next.js SaaS · 登录/Dashboard/付费）
  - `t.autoglobalai.com` → Cloudflare Worker（扫码 + 推送 + QR 生成）
- **技术栈**：nexty 3.3.3（Next.js 16 + React 19 + Better Auth + Drizzle + Stripe/Creem）+ 独立 Supabase project + CF Worker
- **商业模式**：Freemium $0 / $4.9 月 / $29 终身（统一 USD，Creem 结汇国内）
- **MVP**：2 周，目标 Month 3 累计 1000 注册 / 50 付费

---

## 1. 架构

### 1.1 整体图

```
┌──────────────────────────────────────────────┐
│  movecar.autoglobalai.com (Vercel)           │
│  Next.js 16 + nexty 3.3.3                    │
│  - 营销页 / Pricing / Login                   │
│  - 车主 Dashboard（Tag / 推送渠道 / 历史）     │
│  - /api/* (Drizzle → Supabase)               │
│  - 订阅付费（Stripe + Creem）                  │
└────────────────┬─────────────────────────────┘
                 │ Drizzle postgres-js
                 ▼
┌──────────────────────────────────────────────┐
│  Supabase Postgres (独立 project: movecar)    │
│  - Better Auth 表                             │
│  - tags / notifications / push_tokens / subs │
└──────────────────────────────────────────────┘
                 ▲
                 │ HTTPS (HMAC 签名)
                 │
┌──────────────────────────────────────────────┐
│  t.autoglobalai.com (CF Worker)              │
│  - /t/{shortCode}    扫码落地页（HTML）        │
│  - /api/notify       推送（Bark/FCM/TG）      │
│  - /owner-confirm    车主确认页               │
│  - /api/qr/{tagId}   QR 生成                 │
└──────────────────────────────────────────────┘

autoglobal.ai（主站）—— 不动代码
可选互导：
  • autoglobal 首页放 MoveCar 产品卡片 CTA
  • MoveCar 扫码页底部强展示 autoglobal CTA
```

### 1.2 架构决策

| 议题 | 决策 | 理由 |
|---|---|---|
| 与 autoglobal 关系 | 子域名 + 营销互导，零代码耦合 | 真正"矩阵"语义；autoglobal 不需要改动 |
| Supabase project | **独立** `movecar-prod`（免费档） | 隔离、可独立扩展/转让 |
| Auth | Better Auth 独立实例（movecar 自己 user 库） | 不搞 SSO，MVP 最简 |
| SaaS 外壳 | 保留 `movecar/saas-web`（nexty 现成） | 登录/付费/i18n/R2/Sentry 全现成 |
| CF Worker | 保留现有 `movecar.js` 思路 → TypeScript 重写 | 扫码/推送走边缘最低延迟 |
| Worker ↔ SaaS 通信 | HTTP + HMAC 签名 | Worker 不直连 Supabase，保持边缘简洁 |
| 定价 | 统一 USD（Creem 结汇国内） | 简化汇率管理 |
| 订阅过期 | 降级 Free（保留账号 + 1 个活跃 tag） | 保活，提高续费率 |
| 扫码页 autoglobal CTA | 强展示（底部大卡片） | 矩阵引流核心价值 |
| Telegram bot | 独立注册 `@movecar_notify_bot` | 品牌独立 |

### 1.3 为什么这样最简

- **SSO 不做**：没有跨项目账号问题，用户在 movecar 注册独立账号
- **共享数据不做**：autoglobal 和 movecar 各自数据库
- **内部 API 最小化**：只 Worker → Next.js 一条链路（3 个 endpoint）
- **基础设施最少**：1 个 Vercel 项目 + 1 个 Supabase project + 1 个 CF Worker

---

## 2. 现状盘点与变现缺口

### 2.1 现状

| 资产 | 状态 |
|---|---|
| `movecar.js` (CF Worker + KV) | ✅ 已有 demo，需重写为 TS + 接 DB |
| `movecar/saas-web` (nexty 脚手架) | ✅ 已 clone，需定制为 MoveCar 业务 |
| `supabase_schema.sql` | ✅ 三表 DDL 写好，待落库 + 扩展 |
| `preview-owner.html` / `preview-requester.html` | ✅ 可作 Worker HTML 模板基础 |

### 2.2 变现缺口（按优先级）

**P0（MVP 必须）**
1. SaaS 闭环：Worker 接 DB + 车主 Dashboard + 订阅付费
2. 多渠道推送：Bark + FCM + Telegram + Email（MVP 四渠道）
3. Tag 管理 + 历史记录 + 二维码 PDF 下载（3 个基础模板）
4. 扫码页重构 + autoglobal 强 CTA + i18n 三语
5. 反滥用：Rate limit + 订阅过期降级 cron
6. GDPR：隐私政策 + cookie banner + 数据删除流程

**P1（上线后 4 周内）**
7. WhatsApp + SMS 推送（Twilio）
8. 扫码热力图 / 时段分布看板
9. SEO 落地页 3 篇
10. 推荐计划（邀请送月 Pro）
11. 实体挪车牌下单（对接 autoglobal 供应链）
12. AI 美化模板 v2

**P2（Month 3+）**
13. 黑名单 / 反滥用引擎升级
14. 车队企业版 / API 开放
15. 原生 App 决策点

---

## 3. 用户与场景

### 3.1 Persona
- **A**：国内都市车主（主力付费）· 35 岁 · Bark 偏好 · $4.9/月
- **B**：海外华人车主（autoglobal 同门客群）· 30~45 岁 · Telegram/WhatsApp · $29 买断
- **C**：扫码请求者（匿名、非注册、高频）· 页面曝光 = autoglobal 品牌 impression

### 3.2 典型流程

```
车主注册：movecar.autoglobalai.com 登录 → 创建 tag → 绑推送 → 付费 → 下载 PDF

请求者扫码：t.autoglobalai.com/{code} → 填留言+位置 → 通知车主
           → 页面底部强 CTA "AutoGlobal · 海外购车/车辆出海"

车主收到推送：点进 /owner-confirm → 看位置 → 回复"我这就来"

数据看板：Dashboard 看扫码次数/时段分布/地点热力图
```

---

## 4. 数据模型

完全在独立 `movecar-prod` Supabase project 里，`public` schema，MoveCar 业务表前缀 `movecar_`（避免与 nexty 现有 `tags`/`subscriptions` 表冲突）。

**订阅和付费完全复用 nexty 现有基础设施**（`subscriptions` + `orders` + `pricingPlans`），只需在 `pricingPlans` 里创建 3 档 MoveCar 套餐（Free / Pro Monthly / Pro Yearly / Lifetime）。

新增 3 张业务表：

```typescript
// saas-web/lib/db/schema.ts （追加段落）

export const movecarTags = pgTable(
  'movecar_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    shortCode: varchar('short_code', { length: 10 }).notNull().unique(),
    plateNumber: text('plate_number'),
    vehicleModel: text('vehicle_model'),
    templateId: varchar('template_id', { length: 50 }).default('classic').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    settings: jsonb('settings').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index('idx_movecar_tags_user_id').on(t.userId),
    shortCodeIdx: index('idx_movecar_tags_short_code').on(t.shortCode),
  })
);

export const movecarNotifications = pgTable(
  'movecar_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tagId: uuid('tag_id').notNull().references(() => movecarTags.id, { onDelete: 'cascade' }),
    requesterIp: varchar('requester_ip', { length: 45 }),
    requesterLocation: jsonb('requester_location'),
    message: text('message'),
    status: varchar('status', { length: 50 }).default('pending').notNull(),
    channelsSent: jsonb('channels_sent').default([]).notNull(),
    oneTimeTokenHash: varchar('one_time_token_hash', { length: 64 }),
    ownerReply: text('owner_reply'),
    ownerLocation: jsonb('owner_location'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tagIdx: index('idx_movecar_notif_tag_id').on(t.tagId),
    ipCreatedIdx: index('idx_movecar_notif_ip_created').on(t.requesterIp, t.createdAt),
  })
);

export const movecarPushTokens = pgTable(
  'movecar_push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 30 }).notNull(),  // bark / fcm / telegram / whatsapp / sms / email
    tokenValue: text('token_value').notNull(),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userChannelIdx: index('idx_movecar_push_tokens_user_channel').on(t.userId, t.channel),
  })
);
```

**套餐与 pricingPlans 对应**（`lib/db/seed/` 或手动 insert）：
- `movecar_free` · $0 · 1 tag · 30 通知/月
- `movecar_pro_monthly` · $4.9 · 10 tags · 无限
- `movecar_pro_yearly` · $49 · 10 tags · 无限
- `movecar_lifetime` · $29 · 无限 tags · 永久

套餐类型通过 `pricing_plans.environment` 或 `metadata` 字段标识为 `movecar_*`，避免与 nexty 其他付费功能混淆。

---

## 5. 定价

| 套餐 | Free | Pro | Lifetime |
|---|---|---|---|
| 价格 | $0 | $4.9/mo · $49/yr | $29 一次性 |
| Tag 数量 | 1 | 10 | 无限 |
| 通知/月 | 30 | 无限 | 无限 |
| 推送渠道 | Bark / Email | 全渠道 | 全渠道 |
| 模板 | 3 基础 | 全部 30+ | 全部 + 新模板优先 |
| 历史保留 | 7 天 | 180 天 | 永久 |
| 热力图 | ❌ | ✅ | ✅ |
| 实体挪车牌（P1）| 自费 $19.9 | 首年 1 张免费 | 2 张 |

**到期降级**：Pro/Lifetime 过期 → 自动 Free（保留账号 + 最近 1 个活跃 tag，其余禁用）

**结算路由**：IP/Accept-Language CN → Creem；其他 → Stripe；UI 永远显 USD

---

## 6. 关键接口

### Worker ↔ SaaS 内部 API（HMAC 签名）

```
GET  /api/internal/tag/:shortCode
  → { tagId, ownerId, isActive, planType, delaySeconds, templateId }

POST /api/internal/notify
  body: { shortCode, message?, requesterLocation?, requesterIp }
  → { notificationId, pushTokens: [...], oneTimeToken, delayedUntil? }

POST /api/internal/owner-confirm
  body: { notificationId, oneTimeToken, ownerReply, ownerLocation? }
  → { success }

PATCH /api/internal/notify/:id/delivery
  body: { channelsSent, channelsFailed }
```

所有请求带 `X-Internal-Signature` + `X-Timestamp`，共享 `WORKER_SECRET`。

---

## 7. 非功能需求

| 维度 | 目标 |
|---|---|
| 扫码页 LCP | < 1.5s |
| 推送 P95 送达 | < 3s |
| Worker 冷启动 | < 100ms |
| SLA | 99.9% |
| Rate limit | IP: 扫码 5/min；Tag: 通知 20/h |
| 位置数据 | 7 天脱敏城市级，30 天硬删 |
| GDPR | cookie banner + 删除流程 |
| 合规 | 隐私政策 + 服务协议 + 退款政策 |

---

## 8. 部署

| 组件 | 平台 | 域名 |
|---|---|---|
| SaaS Next.js | Vercel | `movecar.autoglobalai.com` |
| CF Worker | Cloudflare | `t.autoglobalai.com` |
| DB | Supabase（独立 project） | ap-southeast-1 |
| R2 / KV | CF（复用现有或独立） | — |
| DNS | Cloudflare | `autoglobalai.com` 下加两条 CNAME / Worker route |

### 环境变量

```
# saas-web (Vercel)
DATABASE_URL=                    # Supabase movecar-prod
BETTER_AUTH_SECRET=              # 独立 secret
NEXT_PUBLIC_SITE_URL=https://movecar.autoglobalai.com
NEXT_PUBLIC_WORKER_URL=https://t.autoglobalai.com
WORKER_SECRET=                   # 与 Worker 共享 HMAC 密钥
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PRO_MONTHLY=
STRIPE_PRICE_ID_PRO_YEARLY=
STRIPE_PRICE_ID_LIFETIME=
CREEM_API_KEY=
CREEM_WEBHOOK_SECRET=
CREEM_PRODUCT_ID_PRO_MONTHLY=
CREEM_PRODUCT_ID_PRO_YEARLY=
CREEM_PRODUCT_ID_LIFETIME=
TELEGRAM_MOVECAR_BOT_TOKEN=
FCM_SERVER_KEY=
RESEND_API_KEY=
SENTRY_DSN=
POSTHOG_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# CF Worker (wrangler secrets)
WORKER_SECRET=                   # 同上
SAAS_API_URL=https://movecar.autoglobalai.com
TELEGRAM_MOVECAR_BOT_TOKEN=      # Worker 直接发 TG
FCM_SERVER_KEY=                  # Worker 直接发 FCM
```

---

## 9. 与 autoglobal 主站的关系

**只做 3 件事**：

1. **域名挂靠**：`movecar.autoglobalai.com` + `t.autoglobalai.com` 挂在 autoglobalai.com 根域下
2. **autoglobal 首页加 MoveCar 产品卡片**（可选、不阻塞 MVP）：autoglobal 主站首页 features 区块放一个「MoveCar · 智能挪车通知」卡片，CTA 跳 `movecar.autoglobalai.com`
3. **MoveCar 扫码页强展示 autoglobal CTA**：扫码落地页底部占 1/3 屏幕放 autoglobal 主业务引流卡片（三语）

**不做**：数据同步、账号共享、Schema 融合、Auth 跨域、内部 API 互调。

---

## 10. 发布计划

| 里程碑 | 目标 | 时间 |
|---|---|---|
| Sprint 0 | DNS + Supabase + 环境变量 | Day 0-1 |
| Sprint 1 | saas-web 定制（Schema / Dashboard / Tag CRUD / 订阅） | Day 2-6 |
| Sprint 2 | 推送多渠道 + Worker 改造 + 内部 API | Day 7-10 |
| Sprint 3 | QR/PDF + 历史 + 合规 + 监控 + 内测 | Day 11-14 |
| W3~4 | 50 人内测 + bug 修复 | Week 3-4 |
| Month 2 | P1 功能 | Week 5-8 |
| Month 3 | P2 决策点 | Week 9-12 |

### 成功指标

| 指标 | W4 | Month 3 |
|---|---|---|
| 注册车主 | 100 | 1000 |
| 付费订阅 | 10 | 50 |
| 扫码 → 注册 CVR | 2% | 3% |
| 扫码 → autoglobal CTA CTR | 3% | 5% |
| 月扫码数 | 1k | 30k |

---

## 11. 风险

| 风险 | 对策 |
|---|---|
| 海外推送送达率 | FCM + Telegram 双通道兜底 |
| GDPR 投诉 | 上线即配 banner + 隐私政策 + 删除流程 |
| 恶意扫码 | Rate limit + Turnstile + 黑名单 |
| Worker ↔ SaaS 通信断开 | Worker 本地降级：仍发推送（用缓存 tokens），不写历史 |
| Supabase 免费档超额 | Month 2 升级 Pro ($25/月) |

---

## 12. 参考

- 现有 Worker：`/Users/clarkfan/movecar/movecar.js`（改造）
- SaaS 外壳：`/Users/clarkfan/movecar/movecar/saas-web/`（定制）
- Schema 雏形：`/Users/clarkfan/movecar/movecar/supabase_schema.sql`（扩展）
- 任务清单：[TASKS.md](./TASKS.md)
