# MoveCar 当前交接

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `feat/movecar-paid-launch`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格先存 pending，再下单；明选 Stripe/Waffo 并固化 API base/环境/SKU/税类，原文 HMAC 校验 ref/网关单/金额/币种/通道/mode/实际交易及 Waffo order ID，幂等及跨单拒绝；旧单沿原快照，订阅仍 UI 禁购/服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 验证：既有 Worker 21 测试、SaaS 类型/ESLint/生产构建证据保留；Waffo 20 core/config/contract 测试与隔离真实 PostgreSQL 合成数据通过，覆盖先持久/重用/改默认/未签名与金额或 mode 拒绝/并发幂等/双标识跨单拒绝/未知结果不重建/缺 SKU 不落单。
- ego-browser 空间 31：生产 Vercel 首页与扫码 health 可访问，自定义主站 ERR_CONNECTION_CLOSED；隔离本地浏览器验证定价过滤、订阅禁购、未登录购买跳转、状态页与 unsigned callback 401。生产登录→通知→真实付款全链路仍待验收。
- 网关 `paibao-console` 主树有 UU 冲突，维护补丁在 `/Users/clarkfan/_worktrees/paibao-gateway-recovery`；首次冻结 9a4b24d 经 Python/代码审查，88 隔离 pytest 通过，后续补并发资源上限/独立 pay CI，未部署。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。
- Waffo 适配在 `/Users/clarkfan/_worktrees/movecar-waffo` / `feat/movecar-waffo`，消费端不触发会用本地报价合成 amount 的主动查单；其他调用者的合成回调无法区分。生产 health 可用但商品仅 PulseAgent，MoveCar Lifetime 待人审，禁止复用 29 USD 月订阅 SKU；下一步审查/人审建品/税额与实收及退款验收。未建品、下真单、部署或读取凭据。
