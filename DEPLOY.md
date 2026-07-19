# MoveCar 生产部署检查清单

> 本清单面向新版 MoveCar SaaS（`movecar/saas-web/` + `movecar/worker/`）。
> 旧版单文件 Worker 见 `README.md`。

---

## 1. 基础设施

- [ ] **域名**：准备主站域名（如 `movecar.autoglobalai.com`）和短链域名（如 `t.autoglobalai.com`）。
- [ ] **DNS**：在 Cloudflare 添加两条 CNAME：
  - `movecar.autoglobalai.com` → Vercel 提供的 CNAME
  - `t.autoglobalai.com` → 先保持 DNS-only 或占位，Worker 部署后再切 route
- [ ] **SSL**：Cloudflare Universal SSL 开启 Full (strict)。
- [ ] **数据库**：创建 Postgres 实例（Supabase / Vercel Postgres / Neon），拿到 `DATABASE_URL`。
- [ ] **对象存储**（可选）：Cloudflare R2 用于头像/PDF 文件，拿到 `R2_*` 变量。
- [ ] **Redis**（必需）：Upstash Redis，拿到 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。

---

## 2. 支付账号

### Stripe（国际用户）

- [ ] 创建 3 个 Product：
  - `MoveCar Pro Monthly`
  - `MoveCar Pro Yearly`
  - `MoveCar Pro Lifetime`
- [ ] 为每个 Product 创建 Price：
  - Monthly: `$4.9 / month`
  - Yearly: `$49 / year`
  - Lifetime: `$29 / one-time`
- [ ] 复制 Price ID 和 Product ID 到环境变量：
  - `STRIPE_PRICE_ID_PRO_MONTHLY`
  - `STRIPE_PRICE_ID_PRO_YEARLY`
  - `STRIPE_PRICE_ID_LIFETIME`
  - `STRIPE_PRODUCT_ID_PRO_MONTHLY`
  - `STRIPE_PRODUCT_ID_PRO_YEARLY`
  - `STRIPE_PRODUCT_ID_LIFETIME`
- [ ] 配置 Stripe Webhook endpoint：`https://movecar.autoglobalai.com/api/stripe/webhook`
  - 事件：`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `radar.early_fraud_warning.created`
- [ ] 复制 `STRIPE_WEBHOOK_SECRET`。

### Creem（中国用户，可选）

- [ ] 在 Creem Dashboard 创建对应 3 个 Product。
- [ ] 回填 `CREEM_PRODUCT_ID_PRO_MONTHLY` 等变量。
- [ ] 配置 Webhook endpoint：`https://movecar.autoglobalai.com/api/creem/webhook`
- [ ] 复制 `CREEM_WEBHOOK_SECRET`。

---

## 3. 密钥生成

```bash
# Better Auth
openssl rand -base64 32

# Worker HMAC（SaaS 与 Worker 共享）
openssl rand -hex 32

# Cron 调用密钥
openssl rand -hex 32

# Telegram webhook secret（可选）
openssl rand -hex 16
```

---

## 4. Vercel 部署 saas-web

### 环境变量

在 Vercel Project → Settings → Environment Variables 中填入：

```
NEXT_PUBLIC_SITE_URL=https://movecar.autoglobalai.com
NEXT_PUBLIC_PRICING_PATH=/#pricing
NEXT_PUBLIC_COOKIE_CONSENT_ENABLED=true
NEXT_PUBLIC_USER_SOURCE_TRACKING_ENABLED=true
NEXT_PUBLIC_RATE_LIMIT_ENABLED=true

DATABASE_URL=postgresql://...

BETTER_AUTH_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...

RESEND_API_KEY=...
ADMIN_EMAIL=...
ADMIN_NAME=...

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CUSTOMER_PORTAL_URL=/dashboard/subscription

CREEM_API_BASE_URL=https://api.creem.io/v1
CREEM_API_KEY=...
CREEM_WEBHOOK_SECRET=...

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=https://...

NEXT_PUBLIC_SENTRY_DSN=...
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

NEXT_PUBLIC_WORKER_URL=https://t.autoglobalai.com
WORKER_SECRET=...
CRON_SECRET=...

STRIPE_PRICE_ID_PRO_MONTHLY=...
STRIPE_PRICE_ID_PRO_YEARLY=...
STRIPE_PRICE_ID_LIFETIME=...
STRIPE_PRODUCT_ID_PRO_MONTHLY=...
STRIPE_PRODUCT_ID_PRO_YEARLY=...
STRIPE_PRODUCT_ID_LIFETIME=...

CREEM_PRODUCT_ID_PRO_MONTHLY=...
CREEM_PRODUCT_ID_PRO_YEARLY=...
CREEM_PRODUCT_ID_LIFETIME=...

TELEGRAM_MOVECAR_BOT_TOKEN=...
NEXT_PUBLIC_TELEGRAM_MOVECAR_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...

FCM_SERVER_KEY=...
```

### 部署命令

```bash
cd movecar/saas-web
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npx vercel --prod
```

---

## 5. GitHub Actions CI/CD

仓库已配置两个 workflow：

- `.github/workflows/deploy-saas-web.yml`：push 到 `main` 且 `saas-web/**` 变更时，先 typecheck 再部署到 Vercel Production。
- `.github/workflows/deploy-worker.yml`：push 到 `main` 且 `worker/**` 变更时，先 typecheck + Vitest 再部署到 Cloudflare Production。

### 需要配置的 GitHub Secrets

在 GitHub Repo → Settings → Secrets and variables → Actions → Repository secrets 中添加：

| Secret | 说明 |
|--------|------|
| `VERCEL_TOKEN` | Vercel personal access token（https://vercel.com/account/tokens） |
| `VERCEL_ORG_ID` | 可选，多组织时需要 |
| `VERCEL_PROJECT_ID` | Vercel 项目 ID（可在项目 Settings → General 找到） |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token，权限：`Cloudflare Workers:Edit`, `Zone:Read` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

### Vercel 项目关联

首次在 CI 中部署前，需要在本地把项目 link 到 Vercel：

```bash
  cd movecar/saas-web
  npx vercel link
```

这会在项目下生成 `.vercel/project.json`，把其中的 `projectId` 和 `orgId` 作为 GitHub secrets 或 CI 变量即可。

---

## 6. Cloudflare Worker 部署

### 创建 KV

```bash
cd movecar/worker
npm exec -- wrangler kv namespace create MOVECAR_KV
npm exec -- wrangler kv namespace create MOVECAR_KV --env staging
npm exec -- wrangler kv namespace create MOVECAR_KV --env production
```

把返回的 ID 填入 `wrangler.toml`。

### Secrets

```bash
npm exec -- wrangler secret put WORKER_SECRET --env production
npm exec -- wrangler secret put TELEGRAM_MOVECAR_BOT_TOKEN --env production
npm exec -- wrangler secret put FCM_SERVER_KEY --env production
npm exec -- wrangler secret put BARK_DEFAULT_URL --env production  # 可选
```

### 部署

```bash
npm run deploy:production
```

### 路由

部署后，在 Cloudflare Dashboard → Worker → Triggers → Routes 添加：

```
t.autoglobalai.com/*
```

---

## 7. 数据库 Seed

首次部署后必须执行：

```bash
cd movecar/saas-web
npm run db:seed
```

这会把 `lib/db/seed/pricing-config.ts` 里的 Free/Pro Monthly/Pro Yearly/Lifetime 计划写入数据库。

---

## 8. 上线前回归测试

### 注册/登录

- [ ] 通过 Google OAuth 登录成功。
- [ ] Dashboard 显示 MoveCar 菜单（Tags / Notifications / History / Subscription）。

### Tag 管理

- [ ] Free 用户只能创建 1 个 tag。
- [ ] Pro 用户可创建 10 个 tag。
- [ ] Lifetime 用户无限制。
- [ ] 可下载/打印 QR（HTML 打印页）。

### 订阅支付

- [ ] Stripe test mode：Monthly 订阅走通，webhook 生成 `subscriptions` 记录。
- [ ] 支付成功后 Dashboard 显示 Pro。
- [ ] Stripe Customer Portal 可取消订阅。
- [ ] 取消后 cron `/api/cron/expire-check` 运行后降级为 Free。

### 扫码通知

- [ ] 扫码 `https://t.autoglobalai.com/{shortCode}` 显示请求者页面。
- [ ] 点击通知车主，车主收到 Bark / Email / Telegram / FCM 推送。
- [ ] Free 用户每月超过 30 条通知后被限制。
- [ ] 车主点击确认后请求者看到车主位置。

### 合规

- [ ] `/privacy-policy` 可访问。
- [ ] `/terms-of-service` 可访问。
- [ ] EU IP 访问站点显示 cookie banner。
- [ ] Dashboard Settings 可删除账号。

### 安全

- [ ] 无 `WORKER_SECRET` 调用 `/api/internal/movecar/*` 返回 401。
- [ ] 无 `CRON_SECRET` 调用 `/api/cron/expire-check` 返回 401。

---

## 9. 切流量

- [ ] 将 `t.autoglobalai.com` DNS 切到 Cloudflare Worker route。
- [ ] 验证 `curl https://t.autoglobalai.com/health` 返回 `{"ok":true}`。
- [ ] 在主站首页/About 加 MoveCar 产品入口（可选）。

---

## 10. 监控

- [ ] Sentry 能收到错误事件。
- [ ] PostHog 能收到 `tag_created`, `subscribed`, `cta_clicked` 等事件（如已埋点）。
- [ ] Vercel Analytics 开启。

---

## 11. 已知本地问题

- SaaS 使用 `npm run lint`、`npm run typecheck`、`npm run build`；Worker 使用 `npm test` 和 `npm run typecheck`。
- saas-web 缺少 Vitest 测试脚本；关键逻辑依赖 Worker 单测和手动回归。

---

完成以上步骤后，MoveCar 即可对外收费。
