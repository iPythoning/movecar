# MoveCar 任务拆解 v3.0（最终版）

> 配套 PRD：[PRD.md](./PRD.md) · 日期：2026-04-20
>
> - 每个任务：[优先级][工时] · 文件路径 · 验收标准
> - 工时单位：人日（一人全职）
> - MVP 合计 ≈ 12~14 人日
> - **两个子项目**：
>   - `movecar/saas-web/` → 车主 Dashboard（Next.js + nexty 脚手架，部署 Vercel）
>   - `movecar/worker/` → 扫码+推送（CF Worker，新建 TS 项目）
>   - `movecar/movecar.js` → 改造后删除

---

## Sprint 0 · 基础设施（Day 0-1 · 1 人日）

### T0.1 DNS 配置 [P0][0.3d]
- [ ] Cloudflare 添加 `movecar.autoglobalai.com` → CNAME 指向 Vercel
- [ ] Cloudflare 添加 `t.autoglobalai.com` → Worker route
- [ ] SSL 生效（Universal SSL）
- **验收**：两个域名 HTTPS 返回 200 或占位页

### T0.2 Supabase 建 project [P0][0.2d]
- [ ] Supabase 新建 project `movecar-prod`，region ap-southeast-1（就近）
- [ ] 拿 `DATABASE_URL`（Transaction pooler 6543）
- [ ] 另建 staging branch（或独立 project `movecar-staging`）
- **验收**：`psql $DATABASE_URL` 能连；两个环境隔离

### T0.3 环境变量 [P0][0.2d]
- [ ] 生成 `BETTER_AUTH_SECRET`：`openssl rand -hex 32`，存 1Password
- [ ] 生成 `WORKER_SECRET`：`openssl rand -hex 32`，SaaS 和 Worker 共享
- [ ] 补齐 PRD §8 全部变量（Stripe/Creem price IDs 在 T1.7 时创建后回填）
- [ ] Vercel env（production + preview）+ wrangler secrets 同步
- **验收**：`.env.local` / Vercel / wrangler 三处一致

### T0.4 Worker 脚手架 [P0][0.3d]
- **目录**：`/Users/clarkfan/movecar/worker/`（新建，与老 `movecar.js` 并存至 T2.7 替换完成）
- [ ] `pnpm create cloudflare@latest worker --type hello-world --lang ts --framework none`
- [ ] 加入 Hono 框架（`pnpm add hono`）
- [ ] `wrangler.toml`：双 route（`t.autoglobalai.com/*` + 可选 `movecar.autoglobalai.com/api/*`）
- [ ] 创建 KV namespace `MOVECAR_KV`（rate limit + HTML 缓存）
- **验收**：`wrangler dev` 本地可跑，`curl /health` 返回 ok

---

## Sprint 1 · SaaS 定制（Day 2-6 · 5 人日）

### T1.1 Schema 迁移 [P0][0.5d]
- **文件**：`saas-web/lib/db/schema.ts`
- [ ] 在现有 nexty Better Auth 4 表基础上新增 `tags / notifications / pushTokens / subscriptions`（PRD §4）
- [ ] `pnpm db:generate` + `pnpm db:push`
- [ ] 保留现有 nexty 的 `pricingPlans` / `userSource` / `orders` 等表（不清理，避免破坏原 nexty 功能）
- **验收**：Supabase Studio 看到新表 + FK + 索引

### T1.2 nexty 基础定制（品牌替换）[P0][0.5d]
- **文件**：`saas-web/config/` / `saas-web/messages/*.json` / `saas-web/app/[locale]/layout.tsx`
- [ ] 站点名改 "MoveCar"、Logo 换掉、主色改掉
- [ ] 首页 Hero 改挪车码场景（替换 nexty 默认 AI SaaS 文案）
- [ ] Footer 链接精简，加"AutoGlobal 矩阵"入口（链到 autoglobalai.com）
- [ ] 精简登录方式：只保留 magicLink + Google OAuth + Google OneTap（`lib/auth/index.ts` 移除 github/emailOTP/anonymous）
- **验收**：`movecar.autoglobalai.com` 打开是 MoveCar 品牌而非 nexty demo

### T1.3 定价页 + Stripe/Creem SKU [P0][0.8d]
- **文件**：`saas-web/app/[locale]/(basic-layout)/pricing/page.tsx`（复用 nexty 现有）
- [ ] Stripe Dashboard 创建 3 个 Price：`pro_monthly $4.9` / `pro_yearly $49` / `lifetime $29`
- [ ] Creem Dashboard 创建对应 3 个产品
- [ ] 环境变量回填 price/product IDs
- [ ] Pricing 页据用户地域路由结账通道（CN → Creem，其他 → Stripe），UI 永远显 USD
- [ ] 定价卡片按 PRD §5 表格渲染
- **验收**：Stripe test mode 完整走通订阅流程

### T1.4 Dashboard 骨架 [P0][0.5d]
- **文件**：`saas-web/app/[locale]/(protected)/dashboard/`
- [ ] 侧边栏定制：Tags / Notifications / History / Subscription
- [ ] 总览页（`/dashboard` 改为 MoveCar 总览：套餐 / 本月用量 / 快捷操作）
- [ ] 删除 nexty 示例页（ai-demo、credit-usage-example 等）
- **验收**：登录后 UI 是 MoveCar Dashboard

### T1.5 Tag CRUD [P0][1d]
- **Actions**：`saas-web/actions/tags.ts`
  ```typescript
  createTag / listMyTags / updateTag / deleteTag / toggleTagActive
  ```
- [ ] `shortCode` 用 nanoid(8)，冲突重试
- [ ] Zod 校验
- [ ] 套餐限额校验（Free=1 / Pro=10 / Lifetime=∞）
- [ ] 所有 action 校验 `getSession()` + userId 权限
- **页面**：`dashboard/tags/` + `tags/new/` + `tags/[id]/edit/`
- **验收**：CRUD + 越权 403 + 限额阻止

### T1.6 推送渠道配置 [P0][0.8d]
- **Actions**：`saas-web/actions/push-tokens.ts`
- [ ] `listMyPushTokens / addPushToken / deletePushToken / sendTestPush / initTelegramBinding`
- **页面**：`dashboard/notifications/page.tsx` 每渠道卡片
- [ ] Telegram 绑定：生成 6 位 token 存 Upstash TTL 10min → 显示 `https://t.me/movecar_notify_bot?start=xxx`
- [ ] Bark：输入 URL 直存
- [ ] FCM：Web Push `serviceWorker.register` + `PushManager.subscribe`
- [ ] Email：默认 user.email，不用额外绑定
- **验收**：4 渠道绑定 + 测试推送可达

### T1.7 订阅 webhook + 降级 cron [P0][0.8d]
- **文件**：
  - `saas-web/app/api/webhooks/stripe/route.ts`（已有，扩展识别 MoveCar price）
  - `saas-web/app/api/webhooks/creem/route.ts`（同上）
  - `saas-web/app/api/cron/expire-check/route.ts`（新建，Vercel Cron 每日 UTC 00:00）
- [ ] Webhook 处理 `checkout.session.completed` / `subscription.updated` / `.deleted` → upsert `subscriptions`
- [ ] Cron：扫 `current_period_end < now() AND plan_type != 'free'` → 降级 + 禁用多余 tag + 发邮件
- **验收**：Stripe test 完整 + 手动触发 cron 正确降级

### T1.8 内部 API（给 Worker 调）[P0][0.8d]
- **文件**：`saas-web/app/api/internal/`
- [ ] `lib/internal-auth.ts`：HMAC-SHA256 校验 + timestamp ±300s + Upstash 幂等
- [ ] `GET /internal/tag/[shortCode]/route.ts` → 查 tag + subscription 状态
- [ ] `POST /internal/notify/route.ts` → 写 notifications + 查 push_tokens + 生成 one-time token（JWT，TTL 5min）
- [ ] `POST /internal/owner-confirm/route.ts` → 校验 one-time token + 更新 notification
- [ ] `PATCH /internal/notify/[id]/delivery/route.ts` → Worker 回写送达状态
- **验收**：Postman 4 endpoint + 无 HMAC 返回 401

### T1.9 QR + PDF 生成 [P0][0.3d]
- **文件**：`saas-web/app/api/tags/[id]/pdf/route.ts`
- [ ] `qrcode` 生成 PNG
- [ ] `@react-pdf/renderer` 三档模板（classic / minimal / cartoon）
- [ ] 上传 R2 → presigned URL
- **验收**：下载 PDF 扫码到达 `t.autoglobalai.com/{shortCode}`

---

## Sprint 2 · CF Worker 改造（Day 7-10 · 4 人日）

### T2.1 Worker 入口 + 路由 [P0][0.3d]
- **文件**：`worker/src/index.ts`
- [ ] Hono 路由：
  ```
  GET  /t/:shortCode       scan page
  POST /api/notify         notify
  GET  /owner-confirm      owner confirm page
  POST /api/owner-confirm  owner reply
  GET  /api/qr/:tagId      QR image
  GET  /health
  ```
- **验收**：`curl /health` → ok

### T2.2 SaaS API Client [P0][0.2d]
- **文件**：`worker/src/lib/saas-client.ts`
- [ ] `callSaas(method, path, body)` 自动加 HMAC + timestamp
- **验收**：单测签名与 SaaS 侧校验一致

### T2.3 扫码落地页 [P0][1d]
- **文件**：`worker/src/routes/scan.ts`
- [ ] `GET /t/:shortCode` → 调 `GET /internal/tag/:shortCode`
- [ ] 据 `isActive` 渲染（过期 → 失效页 + 订阅 CTA 跳 Pricing；正常 → 请求者表单）
- [ ] 据 `Accept-Language` 渲染 zh/en/ja
- [ ] **autoglobal CTA 强展示**（底部占 1/3，三语文案）
- [ ] Tailwind CDN + 内联 CSS，LCP < 1.5s
- [ ] KV 缓存 tag 元数据 60s
- **验收**：Lighthouse ≥ 90 + 失效页正确跳转 + CTA 可点击

### T2.4 通知 API + 推送抽象层 [P0][1.2d]
- **文件**：
  - `worker/src/routes/notify.ts`
  - `worker/src/push/index.ts`
  - `worker/src/push/channels/{bark,fcm,telegram,email}.ts`
- [ ] `POST /api/notify` 流程：
  1. 调 SaaS `POST /internal/notify` 拿 tokens + oneTimeToken
  2. `delayedUntil` 存在 → `ctx.waitUntil(scheduleDelayedPush(...))`
  3. 立即并发发所有渠道
  4. 回写 `PATCH /internal/notify/:id/delivery`
- [ ] Channel 接口：`{ name, send(token, payload): Promise<Result> }`
- [ ] 失败重试 1 次
- **验收**：扫码 → 3s 内多渠道收到 + Sentry 上报失败率

### T2.5 车主确认页 + 回复 API [P0][0.5d]
- **文件**：`worker/src/routes/owner-confirm.ts`
- [ ] `GET /owner-confirm?token=xxx` 校验 JWT + 渲染
- [ ] 显示请求者位置（Google Maps 或高德据 locale） + 留言
- [ ] 快捷回复 3 条 + 自定义
- [ ] `POST /api/owner-confirm` → 调 SaaS `POST /internal/owner-confirm`
- **验收**：token 一次性 + 过期 401 + 回复正确写入

### T2.6 QR 生成 [P0][0.3d]
- **文件**：`worker/src/routes/qr.ts`
- [ ] `GET /api/qr/:tagId?size=512` → PNG
- [ ] Worker 兼容的 QR 库（`@nuintun/qrcode` 或 `qrcode` light build）
- [ ] CDN cache: `max-age=31536000, immutable`
- **验收**：返回 PNG + 手机可扫

### T2.7 Rate Limit + 反滥用 [P0][0.3d]
- **文件**：`worker/src/middleware/rate-limit.ts`
- [ ] KV 计数器（TTL 60s）
- [ ] IP: 扫码 5/min / 通知 10/min
- [ ] Tag: 通知 20/hour（SaaS 侧也校验）
- [ ] 超限 429 + Retry-After
- **验收**：压测触发限流

### T2.8 迁移 movecar.js + 删除旧代码 [P0][0.2d]
- [ ] WGS84→GCJ02 坐标转换迁到 `worker/src/lib/geo.ts`
- [ ] 地图 URL 生成器迁移
- [ ] `wrangler deploy --env staging` 部署
- [ ] 验证通过后删除 `/Users/clarkfan/movecar/movecar.js` 和 `/Users/clarkfan/movecar/movecar/movecar.js`
- **验收**：staging 全链路通 + 旧文件删除

---

## Sprint 3 · 观测 + 合规 + 内测（Day 11-14 · 3 人日）

### T3.1 Sentry + PostHog 埋点 [P0][0.5d]
- [ ] SaaS：已有配置，新增 PostHog 事件 `tag_created / subscribed / cta_clicked`
- [ ] Worker：`@sentry/cloudflare` 集成，事件 `scan / notify_sent / owner_replied`
- **验收**：两侧错误上报 + 事件流可观测

### T3.2 GDPR / 隐私合规 [P0][0.5d]
- [ ] 扫码页 cookie banner（EU IP 显示）
- [ ] `/privacy-policy`、`/terms-of-service`（复用 nexty 模板，改品牌）
- [ ] Dashboard 加「删除我的数据」按钮（软删 + 7 天硬删 cron）
- **验收**：EU VPN 看到 banner + 删除流程跑通

### T3.3 SEO 落地页（2 篇 P0）[P0][0.5d]
- [ ] `/blog/how-to-make-parking-qr-code` (en)
- [ ] `/blog/挪车码方案推荐` (zh)
- [ ] 用 nexty blog CMS（`content/` 或 `blogs/`）
- **验收**：GSC 索引

### T3.4 Landing Page [P0][0.5d]
- [ ] 首页 Hero + Features + How it works + FAQ
- [ ] 明显 "AutoGlobal 矩阵成员" 标识（footer + about 页）
- **验收**：60 秒内传达产品价值

### T3.5 Staging 全链路测试 [P0][0.5d]
- [ ] 10 场景回归（注册 / tag / 订阅 / 扫码 / 4 渠道推送 / 回复 / 取消订阅 / 降级 / GDPR 删除 / Rate limit）
- [ ] iPhone Safari / Android Chrome / Mac Chrome / Win Edge
- [ ] 海外 VPN：SG / US / JP
- **验收**：10 场景全通过 + Sentry 无 CRITICAL

### T3.6 生产部署 + 内测 [P0][0.5d]
- [ ] Vercel Production + `wrangler deploy --env production`
- [ ] 可选：autoglobal 主站首页加 MoveCar 产品卡片（跳 movecar.autoglobalai.com）
- [ ] 招募 50 内测（autoglobal 老客户 + 朋友圈）
- **验收**：生产链路通 + 内测名单就位

---

## Sprint 4+ · P1 / P2

### Month 2 · P1

| 任务 | 工时 |
|---|---|
| WhatsApp + SMS（Twilio） | 1d |
| 推荐计划（邀请送月 Pro） | 1d |
| 扫码热力图 / 时段分布 | 1.5d |
| 实体挪车牌下单（对接 autoglobal 供应链）| 2d |
| AI 美化模板 v2（Nanobanana / gpt-image-1） | 1.5d |
| Admin 面板（用户/订阅/tag/滥用报告） | 1d |

### Month 3 · P2 决策点

- 原生 App 评估（iOS 推送送达率 + PWA 装机率）
- 车队企业版 $99/mo
- API 开放（物流车队集成）

---

## 定义完成（DoD）

- [ ] lint + tsc 通过
- [ ] 关键路径有 Vitest 单测
- [ ] Sentry / PostHog 埋点就位
- [ ] Staging 验证通过
- [ ] PR 经 `typescript-reviewer` agent 审查

---

## 代理委派

| 任务 | 代理 |
|---|---|
| Schema 评审 | `database-reviewer` |
| Worker 架构 / 推送抽象 | `code-architect` |
| 内部 API HMAC / Rate limit / GDPR | `security-reviewer` |
| 代码审查 | `typescript-reviewer` |
| 测试 | `tdd-guide` / `e2e-runner` |
| 部署问题 | `build-error-resolver` |

---

## 下一步

**你执行**：
1. Supabase 新建 project `movecar-prod`，拿 DATABASE_URL
2. `openssl rand -hex 32` 生成两个 secret（BETTER_AUTH / WORKER）存 1Password
3. Cloudflare 注册 `@movecar_notify_bot` Telegram Bot 拿 token
4. Stripe + Creem 创建 3 档产品 SKU（Pro Monthly / Yearly / Lifetime）

**我执行**：
1. T0.1 DNS 配置（需你 CF 账号授权 或 你自己点）
2. T0.4 Worker 脚手架（独立可跑）
3. T1.1 Schema 迁移（独立可跑）
4. T1.2 nexty 品牌定制（独立可跑）

确认 Go 即可开始。
