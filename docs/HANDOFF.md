# MoveCar 当前交接

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `feat/movecar-cloudflare`（用户要求停止 Vercel 发布，改 Git→Cloudflare），PR #1 已合并，发布代码 `6beab0a919590a98dcab89867639ea0b137c9613`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格先存 pending，再下单；明选 Stripe/Waffo 并固化 API base/环境/SKU/税类，原文 HMAC 校验 ref/网关单/金额/币种/通道/mode/实际交易及 Waffo order ID，幂等及跨单拒绝；旧单沿原快照，订阅仍 UI 禁购/服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 2026-10-01 发布：PR #1 已合并；361239e hosted run 36918732572 类型/lint/23 支付测试真实 PG 零 skip/production fixture build 全绿，Worker run 36918732464 21 测试通过；增量代码/TS/凭据审查与合成 CLI 验证通过。main 6beab0a 的 Worker run 36920298949 第二次发布成功，版本 `a87eeafc-36a8-4d50-8df1-ead7f4eec1bd`，前版 `25888aa1-0fbe-4cb0-ac1c-f1de1ea12ca6`，health+穿过 SaaS 鉴权/DB 的未分配码 404 HTML 全通过，未触发回退。
- 主站尚未发布：main SaaS run 36920298984 验证全绿，但 Vercel link 报无权访问固定团队，在生产写入前失败，旧 Vercel 版本保留。CF 两个既有 CI secret 通过已双审/五项合成验证的固定 GitHub STDIN 桥接安全同步后恢复；无明文读出。自定义主站公共 DNS NXDOMAIN，暂用 movecar-saas.vercel.app。ego-browser 空间 31 已交用户，停止继续 Vercel 发布。迁移沿 public 仓已成功的 hosted→CF，不注册 HK/Xserver runner，不加服务器或套餐。
- 网关主树 UU 不碰；四任务提交迁入最新 main 的 `/Users/clarkfan/_worktrees/paibao-gateway-recovery-current`（4c031764，pay 树同已双审 ce9a201），Draft PR #204（https://github.com/iPythoning/paibao-console/pull/204）。PAY_CI_RUNNER 已配置 hosted，run 36897402004 真实 PG 全量 107 passed/0 skip；尚未部署，发布前需两个 PAY_DELIVERY 资源配置与既有发布门禁，不加服务器。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。 本地合成 CRUD/PDF 200 不代表实机：PDF 仍固定英文 A4、中文问号/模板未消费；请求者回复读取、邮件激活向导、Free TG 权限一致性及设备送达待补。
- Waffo 已合入当前本地分支，消费端不触发合成报价的主动查单；其他调用者的合成回调仍无法区分，过期 pending 需人工恢复。生产商品仅 PulseAgent，MoveCar 一次性 Lifetime 待人审，不能复用其 29 USD 月订阅。市场判断：台湾中文验证、香港小试、韩国对照（政府已有 QR 服务），非成交证明；短信尚未实现，台湾需 KYC/链接审核，Vonage/Telnyx 实机对照与成本待验。下一步取得原生产配置并完成 Cloudflare 主站发布，回验现有 Free 链路，再补 PDF/通知/回复与人审 SKU、实收税额退款；未建品、下真单或读取凭据。
- Cloudflare 主站迁移在 canonical `feat/movecar-cloudflare`、[Draft PR #2](https://github.com/iPythoning/movecar/pull/2)：Next 16.3.8 / OpenNext 1.20.7 / Wrangler 4.146.0；请求级 DB/Auth、静态 MDX/内容清单和 CF Cron 已整合，七项必需运行时 secret 单源检查防止使用构建占位配置。
- CI [36963140478](https://github.com/iPythoning/movecar/actions/runs/36963140478) 类型/lint/schema 通过；真实 PG 23 项中业务断言成功但 cleanup 失败（代理 bind 丢失 callable `$client.end`），现已返回原 client；本地类型、5/5 生命周期回归及限定 lint 通过，待新 CI 真实 PG 复验。
- 只读旧平台 API helper 已双审与合成验证，实际 GET 两次 HTTP 403；一次性诊断 job 退出常规 CF 发布链。原 production DATABASE_URL/Auth/Worker/Cron/邮件来源仍缺，本机候选归档 `.env.local` 属 nexty.dev 模板仓，未经确认不得用作 MoveCar 生产配置；已向用户请求安全文件路径/Vault名称。
- 新 Git→CF workflow 单次安装/构建、hash 校验 prebundled 制品、隔离 PG workerd canary（重复 health、匿名 session、三语言 About HTTP及未签名401），再发布/版本读回/线上 smoke，失败回滚复验。workerd 与生产浏览器/console、Free主流程仍待验；HTTP与匿名session不是完整登录/UI验收。
- 初次需安全配置 MOVECAR_RUNTIME_ENV；当前未合并/未发布 CF 主站，二维码 Worker 上游保留现状。CF未压缩约28.5MiB，符合2026-09-05官方free/paid统一64MiB限制；不加服务器、不自动升配。下一步新 CI 全绿＋原生产配置安全迁入后，完成主站发布及二维码切流回验；收费 SKU 仍独立待审。
