# MoveCar 当前交接

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `feat/movecar-paid-launch`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格先存 pending，再下单；明选 Stripe/Waffo 并固化 API base/环境/SKU/税类，原文 HMAC 校验 ref/网关单/金额/币种/通道/mode/实际交易及 Waffo order ID，幂等及跨单拒绝；旧单沿原快照，订阅仍 UI 禁购/服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 验证：既有 Worker 21 测试、SaaS 生产构建证据保留；Waffo 20 core/config/contract（现纳入 CI）与隔离真实 PostgreSQL 合成数据通过，双独立审查批准 cd6b27d；最新 TagForm 保留 0 秒和语言路由，类型/scoped ESLint 及 ego→PG 读回 0/中文列表跳转通过，无新增测试。
- ego-browser 空间 31：Vercel 首页/扫码 health 可访问，自定义主站 ERR_CONNECTION_CLOSED；本地合成认证验证建码/编辑/推送卡/PDF 200，但 PDF 实际固定英文 A4、中文变问号且不消费模板；真实登录/付款/设备送达未验。请求者回复读取闭环、邮件测试/激活向导、Free TG 测试与真实推送权限一致性待补，首页原生提醒/模板等宣传待校正。
- 网关主树 UU 不碰；维护 worktree `/Users/clarkfan/_worktrees/paibao-gateway-recovery` 冻结 ce9a201（含 9a4b24d/c74d572/7577ac0），Python/代码双审批准；最新真实 PG 定向 17 通过，102 全量属前一源码，hosted gate 未跑。部署前需两个 PAY_DELIVERY 资源配置及 PAY_CI_RUNNER，不加服务器。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。
- Waffo 已合入当前本地分支，消费端不触发合成报价的主动查单；其他调用者的合成回调仍无法区分，过期 pending 需人工恢复。生产商品仅 PulseAgent，MoveCar 一次性 Lifetime 待人审，不能复用其 29 USD 月订阅。市场判断：台湾中文验证、香港小试、韩国对照（政府已有 QR 服务），非成交证明；短信尚未实现，台湾需 KYC/链接审核，Vonage/Telnyx 实机对照与成本待验。下一步先闭环 PDF/通知/回复，再人审 SKU、实收税额退款及完整 CI/上线；未建品、下真单、部署、读取凭据或联系客户。
