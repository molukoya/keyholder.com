# Keyholder backend (Stage 2)

One Node.js service runs the website, the app and the API, with a Postgres database. The same app
also runs without a server (the Claude preview, a static host): it then keeps everything in the
browser, exactly as in Stage 1. The app finds out which at start-up (`GET /api/session`).

```
Browser ──► Keyholder service (Node 22, Fastify)  ──► Postgres
            ├─ website + app (dist/)                    users, sessions, accounts,
            ├─ API (/api/*)                             each landlord's data + history,
            └─ background: email sender, daily jobs     outbox, audit log, support
```

## Run it

| What | Command |
|---|---|
| Everything, like production | `npm run build && npm start` → http://localhost:8080 |
| Development (two terminals) | `npm run dev:server` (API on :8080) and `npm run dev` (website on :5173, `/api` is proxied) |
| Tests: types, unit, API | `npm run typecheck && npm test` |
| Browser test, website + app + API | `npm run build && npm run test:e2e` (starts its own server) |
| Browser test, browser-only mode | `npx vite preview --port 4173 &` then `npm run test:ux` |

No database to install: without `DATABASE_URL` the server uses an embedded Postgres (PGlite) in
`./.data/pglite`. Production uses a real Postgres through `DATABASE_URL`.

To sign in as the team locally, start with `ADMIN_EMAIL=you@example.ca ADMIN_PASSWORD=a-long-password npm start`.
Emails are not sent locally; read them at `http://localhost:8080/api/dev/outbox` (local only).

## Deploy on Render

1. Render → **New → Blueprint** → choose this repository (it reads `render.yaml`).
2. Enter the first admin's email and password when asked (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, 10+ characters).
3. Render creates the Postgres database and the web service, builds (`npm ci && npm run build && npm test`) and
   starts it. The site is at the `onrender.com` address Render shows; `APP_URL` defaults to it.
4. Optional: real email (below), Google sign-in (below), your own domain (then set `APP_URL`).

Free plans: the web service sleeps after 15 minutes without visits (the first visit then takes about a
minute), and Render's free Postgres is for trying things out (it expires). For real landlords use paid
plans (Starter web service, Basic Postgres with backups).

**Data residency.** Render has no Canadian region. See `docs/PLAN.md` (Stage 2) before storing real
landlords' data: privacy review under PIPEDA, and a privacy impact assessment for Quebec (Law 25).

Other hosts: the `Dockerfile` builds one container; give it `DATABASE_URL`, or a volume at `/data`.

## Settings (environment variables)

| Name | Default | What it does |
|---|---|---|
| `DATABASE_URL` | — | Postgres. Without it: embedded Postgres in `PGLITE_DIR`. |
| `APP_URL` | Render's address, else `http://localhost:PORT` | Used in email links and the cross-site check. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | — | The first admin, created (or promoted) at start-up. Sign in with the email, or with the username `admin`, and this password (10+ characters). Changing `ADMIN_PASSWORD` changes the team password at the next start and signs out old sessions; a password changed in the dashboard (Team & settings → Your password) stays until `ADMIN_PASSWORD` is changed again. |
| `EMAIL_PROVIDER` | `log` | `log` keeps emails in the outbox (visible to the team); `resend` or `postmark` sends them. |
| `RESEND_API_KEY` / `POSTMARK_TOKEN` | — | Key for the chosen provider. |
| `EMAIL_FROM` | `Keyholder <hello@keyholder.ca>` | Sender. The domain must be verified with the provider. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Turns on "Continue with Google". Redirect URI: `APP_URL/api/auth/google/callback`. |
| `WORKER` | `inline` | `inline`: email sender and daily jobs run in the web service. `off`: run `npm run worker` separately. |
| `DAILY_HOUR` | `9` | Hour (server time zone, `TZ`) for automatic reminders and the daily summary email. |
| `SESSION_DAYS` | `30` | Sign-in lasts this many days (renewed while used). |
| `DEV_TOOLS` | on unless production | `/api/dev/outbox` for reading emails locally. Refuses to start if on in production. |
| `PORT`, `HOST`, `LOG_LEVEL`, `TRUST_PROXY` | 8080, 0.0.0.0, info, on in production | The usual. |

### Switch on real email (Resend, about 10 minutes)

1. Create a Resend account, add your domain (e.g. keyholder.ca) and add the DNS records it shows.
2. Create an API key. In Render, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM=Keyholder <hello@your-domain>`.
3. Redeploy. Emails waiting in the outbox are not re-sent; new ones go out within 10 seconds.

## How it works

**Accounts.** Email and password (scrypt, salted), or Google. Sessions are random tokens in an httpOnly,
SameSite=Lax cookie (Secure on https); only their SHA-256 is stored. Password reset, email confirmation and
team invitations are one-time links (1 hour, 7 days, 7 days). Sign-in is limited to 10 tries a minute per
address and email; wrong passwords and unknown emails get the same answer.

**Cross-site protection.** Every request that changes something must come from the site itself (Origin
check) and carry the `X-Keyholder: 1` header, which a form on another site cannot add. Strict security
headers (CSP, frame-ancestors none, HSTS on https). The CSP allows `'wasm-unsafe-eval'` so the on-device receipt
reader (WebAssembly) can start; it does not allow evaluating text as code.

**A landlord's data.** The app keeps working on its copy in the browser (fast, works offline) and saves
the whole record to the server a moment after each change (`PUT /api/state` with the version it started
from). If another device saved in between, the server merges the two record by record
(`server/merge.ts`: changes on one side are kept; if both changed the same field, the newest save wins;
nothing edited is ever deleted by a merge) and returns the merged copy. The last 50 versions are kept.
Other devices pick up changes when the tab comes back and every minute. Sample data (demo, admin preview)
is never saved to an account.

**Email.** Everything that sends email writes a row in the `outbox` table inside its own transaction; the
sender delivers queued rows every 10 seconds, retrying after 1, 4, 16 and 64 minutes, then marks them
failed (shown under System health). Test and sample addresses (`example.com`, `.test`) are never emailed.
- Receipts and reminders the landlord sends in the app go to every person on the lease (once each).
- Daily at `DAILY_HOUR`: for landlords who turned on automatic sending, late-rent reminders go out on
  their own (same rules and wording as the app's suggestions); for landlords who asked for email updates,
  one short email lists what needs them.
- Welcome / confirm email, password reset, support request received, support replies, team invitations.

**Support dashboard.** Real team members (role `admin` = Owner, `support` = Support) sign in with their
email on the same Sign in page and land on the live dashboard: real landlords (with counts from their
data), support requests from Help → Write to us, announcements shown to every visitor, data requests,
problems, the team and the audit log. The screens are the Stage 1 ones; the server fills the same data
shape (`server/support.ts`) and applies changes field by field (only what an admin may change). Replies
are emailed to the landlord. Support staff cannot delete accounts, change the team or the settings.

**Privacy.** Settings → Download my data (everything, as JSON) and Delete my account (password needed;
data, support requests and history are deleted; the audit log keeps a line without personal details).

## API

All under `/api`, JSON. Changing requests need `X-Keyholder: 1`. Errors are `{ "error": "plain words" }`.

| Method & path | Who | What |
|---|---|---|
| `GET /health` | anyone | `{ ok, version, db }` (Render health check) |
| `GET /session` | anyone | `{ user \| null, config }` |
| `GET /announcements` | anyone | Active announcements |
| `POST /auth/signup` | anyone | `{ name, email, password }` → creates the account and signs in |
| `POST /auth/login` · `POST /auth/logout` | anyone · signed in | Sign in / out |
| `POST /auth/forgot` · `POST /auth/reset` | anyone | Email a reset link · set a new password with it (also team invitations) |
| `POST /auth/verify` · `POST /auth/resend-verify` | anyone · signed in | Confirm the email address |
| `POST /auth/password` | signed in | Change password (signs out other devices) |
| `GET /auth/google/start` · `GET /auth/google/callback` | anyone | Google sign-in (when set up) |
| `GET /state` · `GET /state/meta` · `PUT /state` | landlord | The landlord's data: load, version, save `{ baseRevision, data }` |
| `GET /account/export` · `DELETE /account` | landlord | Download everything · delete the account |
| `POST /support/tickets` · `GET /support/tickets` | signed in | Write to support · my requests |
| `GET /admin/support` · `PUT /admin/support` | team | Dashboard data · apply a change `{ next, log }` |
| `GET /admin/customers/:id/state` · `GET /admin/email` | team | A landlord's data (read-only, logged) · the email log |

## Database

Migrations are in `server/migrations.ts` and run at start-up (each once, in a transaction). Tables:
`users`, `sessions`, `auth_tokens`, `accounts`, `account_state` (+ `account_state_history`),
`message_deliveries`, `outbox`, `audit_log`, `support_tickets`, `announcements`, `data_requests`,
`settings`, `system_errors`, `job_runs`.

## Not done yet (needs an outside service or a decision)

- **Bank data**: needs a Canadian aggregator (Plaid, see `docs/REQUIREMENTS.md` R12). Until then the live app
  shows bank checks as "Coming soon" (`/api/session` config `banks: false`) and removes any practice bank
  connection left in an account; only the browser-only preview simulates them. The matcher is real code.
- **Card payments** for the Landlord plan (Stripe): plans can be set by the team; nobody is charged.
- **Valuation data**: the price index is a placeholder until a data source is licensed.
- **Receipt photos** are saved inside the landlord's data; move them to object storage (S3 in Canada)
  before many landlords upload photos.
- **One record per landlord**: data is saved as one document per account (merged per record). Moving the
  ledger into separate tables (payments, leases, …) is the next step once the server takes over more of
  the logic (bank matching, reminders).
