# MoveCar SaaS

MoveCar is a privacy-first vehicle handoff SaaS. A requester creates a short-lived parking or vehicle handoff page, and the owner can confirm or notify them without exposing a phone number.

## Local development

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the required database, auth, payment, email, and Worker values. The local web app runs on `http://localhost:3000` by default.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

See the repository root [`DEPLOY.md`](../DEPLOY.md) for the production deployment checklist.
