# Keyholder

Rental automation for Canadian landlords with 1 to 10 units.

This repository has the whole product: the website, the landlord app, the support dashboard and the
**Stage 2 backend** (Node.js API with a Postgres database, real accounts, data saved to the account,
email for receipts and reminders, daily automation). See [docs/BACKEND.md](docs/BACKEND.md) for the
backend and [docs/PLAN.md](docs/PLAN.md) for the product plan.

The app runs two ways. Served by the Keyholder server, accounts and data live on the server. Opened
without a server (the Claude preview, GitHub Pages), it keeps everything in the browser, as in Stage 1.

## Run it

```bash
npm install
npm run build && npm start      # website + app + API on http://localhost:8080 (embedded Postgres, no setup)
npm run dev:server              # API only, reloads on change (:8080)
npm run dev                     # website with hot reload (:5173, /api goes to :8080)
```

Sign in as the support team locally: start with `ADMIN_EMAIL=you@example.ca ADMIN_PASSWORD=a-long-password`, then sign in with that email (or the username `admin`) and password.
The sample logins always work: **test / test** (demo landlord) and **admin / admin** (sample support dashboard).

## Tests

```bash
npm run typecheck && npm test   # types; finance, matching, server API and merge tests
npm run build && npm run test:e2e   # browser test of website + app + API against the real server
npx vite preview --port 4173 & npm run test:ux   # every page and journey, browser-only mode
```

GitHub Actions runs all of them on every push (`.github/workflows/ci.yml`).

## Deploy

- **Render (full product)**: Render → New → Blueprint → this repository. `render.yaml` creates the web
  service and a Postgres database and asks for the first admin's email and password. Details and real
  email set-up in [docs/BACKEND.md](docs/BACKEND.md).
- **Docker**: `Dockerfile` builds one container for any host.
- **GitHub Pages (browser-only preview)**: https://molukoya.github.io/keyholder.com/ is published by
  `.github/workflows/pages.yml` on every push to `main` and the working branch.

## Layout

```
server/       the backend: app.ts (API routes), services.ts, merge.ts, email.ts, mails.ts, jobs.ts,
              support.ts (live support dashboard), db.ts + migrations.ts, config.ts (+ tests)
src/
  data/       types.ts, seed.ts, store.tsx (actions), api.ts (server or browser-only), sync.ts (saving to the account)
  lib/        finance.ts, matching.ts, templates.ts, tray.ts, jurisdiction.ts (+ tests), shared with the server
  components/ design system pieces and forms
  screens/    website, signup, sign in, app screens, support dashboard
  support/    support dashboard screens and data
scripts/      e2e-server.cjs, ux-flow-test.cjs, build-server.mjs, build-artifact.mjs, capture-screens.cjs
docs/         PLAN.md (product), BACKEND.md (backend), CREDITS.md
```
