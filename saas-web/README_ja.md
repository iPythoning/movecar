# MoveCar SaaS

MoveCar はプライバシーを重視した車両受け渡し SaaS です。依頼者は期限付きの駐車・受け渡しページを作成でき、所有者は電話番号を公開せずに確認や通知を行えます。

## ローカル開発

```bash
npm ci
npm run dev
```

`.env.example` を `.env.local` にコピーし、データベース、認証、決済、メール、Worker の設定を入力してください。既定の URL は `http://localhost:3000` です。

## 検証

```bash
npm run typecheck
npm run lint
npm run build
```

本番デプロイについては、リポジトリ直下の [`DEPLOY.md`](../DEPLOY.md) を参照してください。
