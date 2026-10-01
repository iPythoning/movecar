# MoveCar 当前交接

- 目标：利用已有需求快速上线隐私挪车，7 天收入 100 美元；真实付款及交付尚未证明，目标保持进行中。
- 当前仓：`/Users/clarkfan/_projects_by_logic/02-emdash-client-sites/movecar`，分支 `feat/movecar-paid-launch`，基线 `baed131`；历史 Obsidian 文件为阅读副本，当前需求入口 `docs/PRD.md`。
- 首轮修复：免费注册 CTA、定价路由、Worker 确认链接、脚本注入、缺失定位、回复状态与 Telegram 验签；两位独立审查无高优先缺陷，Worker/SaaS 类型检查、Worker 21 项测试及 SaaS ESLint 通过（14 条既有警告）。
- 用户已明确支付接本机派宝统一网关；沿用当前价格，不恢复历史 $1/$9.9，不让业务仓持商户密钥。现有网关缺退款/退订/订阅周期消费契约，不能以一次性付款冒充月年订阅。
- 外部只读证据：ego-browser 空间 31，`https://movecar-saas.vercel.app` 首页与 `https://t.autoglobalai.com/health` 可访问；`movecar.autoglobalai.com` 为 ERR_CONNECTION_CLOSED，尚未完整验证生产登录/通知/支付。
- 验证方式：Worker `npm run typecheck` / `npm test`；SaaS `npm run typecheck` / `npm run lint` / `npm run build`；发布前同一 ego 空间验证注册→车辆→打印→匿名通知→车主回复、运行时错误、签名支付回调→权益及退款撤销。不自行打开客户的一次性收银台。
- 下一步：完成可信订单快照、统一网关下单、原文 HMAC 幂等发货及查单恢复；补订阅生命周期，核对生产配置后真实端到端验证。未部署、未联系客户、未投广告。
