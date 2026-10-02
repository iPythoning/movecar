# MoveCar 当前交接

## 2026-10-01 · Cloudflare 迁移源配置只读诊断
- 隔离检出 `/Users/clarkfan/_worktrees/movecar-cf-config`，分支 `feat/movecar-cf-config`；新增 `saas-web/scripts/vercel-source-inventory.mjs`，固定 Vercel API origin、MoveCar slug、GET 和 `decrypt=false`，完整枚举后仅接受唯一项目 ID。
- `VERCEL_TOKEN` 仅由 CI 运行时 env 注入；非敏感限额必须配置 `MOVECAR_VERCEL_REQUEST_TIMEOUT_MS`、`MOVECAR_VERCEL_MAX_TEAM_PAGES`、`MOVECAR_VERCEL_TEAM_PAGE_SIZE`、`MOVECAR_VERCEL_MAX_RESPONSE_BYTES`，无代码默认。
- 仅输出合法固定键名、production/type/visibility、响应非空布尔和投影项目 ID；异常不输出正文、URL、headers、值、长度或 hash。最新 [Vercel 分类](https://vercel.com/docs/environment-variables/sensitive-environment-variables) 的 `visibility` 优先，Secret/legacy Sensitive 为 write-only；响应非空不代表明文可读。
- 验证：`node --check`、独立 code-reviewer 的 20 项合成检查通过并 APPROVE；专职 TS reviewer 因本隔离树无应用依赖而整站 typecheck 失败，未批准，主写者在有完整依赖的 canonical 树继续独立 JS 审查。
- 真实 token/API、配置导出、GitHub/CF/Vercel 写入和生产部署均未执行；下一步由主写者完成独立 JS 审查后在受审 CI 核实旧生产配置源，迁移模式另定。

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `main`，PR #1 已合并，发布代码 `6beab0a919590a98dcab89867639ea0b137c9613`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格先存 pending，再下单；明选 Stripe/Waffo 并固化 API base/环境/SKU/税类，原文 HMAC 校验 ref/网关单/金额/币种/通道/mode/实际交易及 Waffo order ID，幂等及跨单拒绝；旧单沿原快照，订阅仍 UI 禁购/服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 2026-10-01 发布：PR #1 已合并；361239e hosted run 36918732572 类型/lint/23 支付测试真实 PG 零 skip/production fixture build 全绿，Worker run 36918732464 21 测试通过；增量代码/TS/凭据审查与合成 CLI 验证通过。main 6beab0a 的 Worker run 36920298949 第二次发布成功，版本 `a87eeafc-36a8-4d50-8df1-ead7f4eec1bd`，前版 `25888aa1-0fbe-4cb0-ac1c-f1de1ea12ca6`，health+穿过 SaaS 鉴权/DB 的未分配码 404 HTML 全通过，未触发回退。
- 主站尚未发布：main SaaS run 36920298984 验证全绿，但 Vercel link 报无权访问固定团队，在生产写入前失败，旧 Vercel 版本保留。CF 两个既有 CI secret 通过已双审/五项合成验证的固定 GitHub STDIN 桥接安全同步后恢复；无明文读出。自定义主站公共 DNS NXDOMAIN，暂用 movecar-saas.vercel.app。ego-browser 空间 31 已交人完成 Vercel 二步验证，确认后恢复该空间核实团队/项目并重试主站部署。
- 网关主树 UU 不碰；四任务提交迁入最新 main 的 `/Users/clarkfan/_worktrees/paibao-gateway-recovery-current`（4c031764，pay 树同已双审 ce9a201），Draft PR #204（https://github.com/iPythoning/paibao-console/pull/204）。PAY_CI_RUNNER 已配置 hosted，run 36897402004 真实 PG 全量 107 passed/0 skip；尚未部署，发布前需两个 PAY_DELIVERY 资源配置与既有发布门禁，不加服务器。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。 本地合成 CRUD/PDF 200 不代表实机：PDF 仍固定英文 A4、中文问号/模板未消费；请求者回复读取、邮件激活向导、Free TG 权限一致性及设备送达待补。
- Waffo 已合入当前本地分支，消费端不触发合成报价的主动查单；其他调用者的合成回调仍无法区分，过期 pending 需人工恢复。生产商品仅 PulseAgent，MoveCar 一次性 Lifetime 待人审，不能复用其 29 USD 月订阅。市场判断：台湾中文验证、香港小试、韩国对照（政府已有 QR 服务），非成交证明；短信尚未实现，台湾需 KYC/链接审核，Vonage/Telnyx 实机对照与成本待验。下一步完成人工 Vercel 验证、修复主站发布权限并回验现有 Free 链路，再补 PDF/通知/回复与人审 SKU、实收税额退款；未建品、下真单或读取凭据。
- 2026-10-01 CF 内容适配子任务：隔离树 `/Users/clarkfan/_worktrees/movecar-cf-content`，分支 `feat/movecar-cf-content`；本地 CMS 改读构建期 `lib/cms/local-posts.json`，生成器直接读取 `POST_CONFIGS`，保留文件顺序、正文、元数据 Date、本地优先、草稿回退及服务端权限分页。
- About 改静态导入 en/zh/ja MDX 并复用原 MDXComponents；主写者待接入 `@next/mdx`、MDX 类型与 remark-gfm/remark-frontmatter 配置，构建前在 `saas-web` 执行 `node scripts/build-local-content.mjs`。
- 子任务验证：限定 ESLint、生成器语法、diff-check 通过；6 文件原文/元数据/顺序对照、幂等生成、本地/草稿/服务器回退与分页参数合成检查通过。完整类型、MDX 构建、独立代码/TS 审查与浏览器验收由主写者整合后完成；未读取凭据、push 或部署。
