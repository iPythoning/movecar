# MoveCar 当前交接

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `feat/movecar-paid-launch`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格先存 pending，再下单；明选 Stripe/Waffo 并固化 API base/环境/SKU/税类，原文 HMAC 校验 ref/网关单/金额/币种/通道/mode/实际交易及 Waffo order ID，幂等及跨单拒绝；旧单沿原快照，订阅仍 UI 禁购/服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 验证：Draft PR #1（https://github.com/iPythoning/movecar/pull/1）消费端/Waffo/TagForm/CI 均通过独立代码及 TS 审查。真实 hosted f040a27 / run 36897446041 类型、lint、21 支付测试零 skip、限额回环 PG 与合成 production build 全绿；Worker run 36897446020 类型及既有 21 测试通过。TagForm 0 秒/中文跳转 ego→PG 证据保留，无生产部署或真实收款。
- ego-browser 空间 31：Vercel 首页/扫码 health 可访问，自定义主站 ERR_CONNECTION_CLOSED；本地合成认证验证建码/编辑/推送卡/PDF 200，但 PDF 实际固定英文 A4、中文变问号且不消费模板；真实登录/付款/设备送达未验。请求者回复读取闭环、邮件测试/激活向导、Free TG 测试与真实推送权限一致性待补，首页原生提醒/模板等宣传待校正。
- 网关主树 UU 不碰；四任务提交迁入最新 main 的 `/Users/clarkfan/_worktrees/paibao-gateway-recovery-current`（4c031764，pay 树同已双审 ce9a201），Draft PR #204（https://github.com/iPythoning/paibao-console/pull/204）。PAY_CI_RUNNER 已配置 hosted，run 36897402004 真实 PG 全量 107 passed/0 skip；尚未部署，发布前需两个 PAY_DELIVERY 资源配置与既有发布门禁，不加服务器。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。
- Waffo 已合入当前本地分支，消费端不触发合成报价的主动查单；其他调用者的合成回调仍无法区分，过期 pending 需人工恢复。生产商品仅 PulseAgent，MoveCar 一次性 Lifetime 待人审，不能复用其 29 USD 月订阅。市场判断：台湾中文验证、香港小试、韩国对照（政府已有 QR 服务），非成交证明；短信尚未实现，台湾需 KYC/链接审核，Vonage/Telnyx 实机对照与成本待验。下一步先闭环 PDF/通知/回复，再人审 SKU、实收税额退款及完整 CI/上线；未建品、下真单、部署、读取凭据或联系客户。
