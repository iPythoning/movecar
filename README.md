# MoveCar - 隐私优先的智能挪车 SaaS

<!-- bmc:front -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:front -->

MoveCar 是一套可对外收费的挪车通知系统：车主在仪表盘放置专属二维码，被堵车的人扫码即可通过 Bark、FCM、Telegram、Email 等渠道匿名通知车主，双方手机号全程不暴露。

旧版单文件 Worker 已演进为「SaaS Web + Cloudflare Worker」双项目架构，详见 [DEPLOY.md](./DEPLOY.md)。

## 项目结构

```
movecar/
├── saas-web/          # Next.js 车主 Dashboard、支付、定价、管理后台
├── worker/            # Cloudflare Worker：扫码页、通知分发、车主确认
├── docs/              # PRD 与任务拆解
├── DEPLOY.md          # 生产部署检查清单
└── README.md          # 本文件
```

## 核心能力

| 能力 | 实现 |
|------|------|
| 扫码通知 | Worker `GET /t/:shortCode` + SaaS `/api/internal/movecar/tag/:shortCode` |
| 推送渠道 | Bark / FCM / Telegram / Email |
| 定价与付费 | Stripe（国际）+ Creem（中国），Free / Pro Monthly $4.9 / Pro Yearly $49 / Lifetime $29 |
| 订阅生命周期 | Stripe/Creem webhook + Vercel Cron 每日过期降级 |
| 权益控制 | Free=1 车/30 通知/月；Pro=10 车/无限；Lifetime=无限 |
| 合规 | Cookie banner、Privacy Policy、Terms of Service、账号删除 |
| SEO | 多语言 Landing + 博客文章 |

<!-- bmc:middle -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:middle -->

## 本地开发

### saas-web

```bash
cd saas-web
cp .env.example .env.local
# 填入 DATABASE_URL、BETTER_AUTH_SECRET、STRIPE_* 等
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

### worker

```bash
cd worker
cp .dev.vars.example .dev.vars
# 填入 Worker 本地密钥
npm ci
npm run dev
```

## 测试

```bash
cd saas-web
npm run typecheck
npm run lint
npm run build

cd ../worker
npm run typecheck
npm test
```

## 部署

详见 **[DEPLOY.md](./DEPLOY.md)**，包含域名/DNS/SSL、Stripe/Creem、Vercel、Cloudflare Worker、GitHub Actions 和数据库上线检查。

当前已完成代码基线、数据库迁移/定价 seed、Worker staging/production 部署以及 Vercel production 部署；公网 DNS 和未配置的第三方通知渠道仍需按清单完成。

## License

MIT

<!-- bmc:end -->
<p align="center"><a href="https://buymeacoffee.com/dayongfan"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=dayongfan&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee"></a></p>
<!-- /bmc:end -->
