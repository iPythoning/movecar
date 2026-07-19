# MoveCar SaaS

MoveCar 是一个隐私优先的车辆交接 SaaS。发起人创建短期停车或车辆交接页面，车主无需暴露手机号即可确认或通知对方。

## 本地开发

```bash
npm ci
npm run dev
```

复制 `.env.example` 为 `.env.local`，填写数据库、认证、支付、邮件和 Worker 配置。默认访问地址为 `http://localhost:3000`。

## 验证

```bash
npm run typecheck
npm run lint
npm run build
```

生产部署请参阅仓库根目录的 [`DEPLOY.md`](../DEPLOY.md)。
