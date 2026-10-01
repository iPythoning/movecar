# MoveCar 当前交接

- 目标：快速上线隐私挪车并在 7 天收入 100 美元；尚无真实付款证据，目标未达成。当前主写分支 `feat/movecar-paid-launch`，需求入口 `docs/PRD.md`，历史 Obsidian 仅为副本。
- 本机统一网关消费端：Lifetime 按 DB 价格快照先存 pending，再下单；原文 HMAC 校验 ref/SKU/网关单/金额/币种/通道/实际交易号，事务幂等开通；旧直连新 checkout 已退役。订阅缺周期/退款/退订契约，UI 禁购且服务端 409。
- 服务端权威普通 CRUD（LWW）：付款、退款、创建/激活车辆和过期任务共用用户事务锁；退款同步停用超额车辆，旧过期订阅不误降级 Lifetime/有效续期；定价只显示 MoveCar，查单有 DB 共享冷却，默认不打印 SQL 支付会话。
- 验证：Worker 21 测试与类型；SaaS 类型、ESLint（14 既有 warning）、生产构建、11 支付测试通过；隔离真实 PostgreSQL 验证快照/重用/原文签名/并发幂等/跨单拒绝/未知结果不重建/退款回收/对账冷却/旧渠道重复购买阻断。
- ego-browser 空间 31：生产 Vercel 首页与扫码 health 可访问，自定义主站 ERR_CONNECTION_CLOSED；隔离本地浏览器验证定价过滤、订阅禁购、未登录购买跳转、状态页与 unsigned callback 401。生产登录→通知→真实付款全链路仍待验收。
- 网关 `paibao-console` 主树有 UU 冲突，维护补丁在 `/Users/clarkfan/_worktrees/paibao-gateway-recovery`；首次冻结 9a4b24d 经 Python/代码审查，88 隔离 pytest 通过，后续补并发资源上限/独立 pay CI，未部署。
- 配置名称见 `saas-web/.env.example` 的 Paibao 段；凭据仅需消费方 PAY_ADMIN_TOKEN / PAIBAO_FULFILL_HMAC_SECRET，经本地安全入口配置，不读明文。未知创建结果仍需人工核查，不自动新建可收费会话。
- 最新用户要求纳入 Waffo：正在核对现有 29 USD Lifetime 商品、paywaffo 实际契约/生产健康；完成消费端适配后统一 PR/配置/真实交易验收。未部署、建品、联系客户或投广告。
