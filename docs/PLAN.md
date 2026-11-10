# Keyholder build plan

## App structure

| Tab | Job | Contents |
|---|---|---|
| Home | Is this month okay, and what needs me? | Keyholder score chip, headline, rent this month (Mark paid / Confirm), Needs you now (receipts, reminders, payments, renewals, new applications, notice deadlines), Raise your Keyholder score |
| Rentals | Run the rentals | Every property (metal strip) and its units: tenant, rent status, one action (Mark paid, Late rent options, Find a tenant). Property page: Units and tenants, Find a tenant, Late rent and notices, Value, Mortgage |
| Portfolio | What do I own and is it working? | Overview (net worth, 12-month earnings and return, net worth over time, property cards or table) and Cash flow |
| Taxes | Tax time | Checklist, totals with T776 lines, export |
| Paperwork | Records | Expense receipts, Rental income, Leases (with next allowed rent increase), Notices and letters |

Phones: Home, Rentals, camera, Portfolio, More (Taxes, Paperwork, Settings).

**Find a tenant:** listing (asking rent, date, description), application form link by email/text/copy/QR,
fixed rights-safe form, applications with status, side-by-side comparison, decline with fair reasons only,
accept → tenant + draft lease, vacancy cost counter.

**Forms in every province** (`src/lib/forms.ts`): pick a situation (rent is late, raise the rent, damage or
behaviour, own use, end by agreement, new lease, inspection) and Keyholder picks the property's provincial form.
Ontario: N4, L1, L9, N1, N5, L2, N12, N11, Standard Lease. BC: RTB-30, RTB-7, RTB-33, RTB-32, RTB-8, RTB-1, RTB-27.
Alberta: templates (14-day notice, rent increase, breach, inspection) and the RTDRS application. Quebec: mandatory
lease, notice of lease modification, formal demand and TAL application (no eviction notice for late rent). All other
provinces and territories use shared templates and link to their official site. One form screen: pre-filled, checks,
slide to approve, delivery and proof of service. Every code, title and period is a placeholder to verify.
The sample has two properties: an investment triplex (Unit B is a couple on one shared lease; Unit C is empty with two applications, one from a couple applying together) and a home whose basement suite is rented by the room (2 of 3 rooms rented, one application for Room 3). It opens with the demo login on the one Sign in form (**test / test**). **admin / admin** opens the support dashboard; any other email signs in to the account saved in the browser. Both are preview locks, not security: the logins sit in the website's code. They set aside the browser's own data, and Sign out puts it back. Real admin accounts (own login, second step, server-side roles) need the backend (Stage 2). Paperwork → Forms can show any province; tests cover every province with a test-only data set.

**Late rent:** reminder → N4 (prefilled from the ledger, termination date from the rules pack, checks, slide to
approve, delivery method limited by email consent, proof of service, cancelled automatically if paid in full)
→ L1 once the N4 date passes. Other provinces: a generic notice of rent owing. Previews only until Stage 2 fills
the official forms. N4 period: 7 days for notices on/after Sept 21, 2026 (14 before), +5 days by mail — verify.

Colour meanings: pine = money in, good, main buttons; rust = needs attention; brass = Keyholder score only;
bronze/silver/gold metal = property stage, on property cards only; ink blue = links.

**Values and sources.** Property value is the only estimate. Every value shows its source and date. Stage 1 uses
a labelled placeholder AVM (price index from purchase price, or rent ÷ local yield). Stage 2: license a Canadian
AVM (Opta/SCM iClarify, Teranet Purview/GeoWarehouse or Altus). HouseSigma, wowa.ca and property.ca have no public
API and forbid scraping, so the app only links to them ("Check it yourself") and lets the owner enter their own estimate.
Net worth counts only properties whose mortgage is known; others are listed as "not counted yet".

## Levels: what users see

Each property earns a level as the owner adds detail. Nothing beyond Bronze is required.
Rules live in `src/lib/levels.ts`; the app shows a level badge on each property and one
"next step" card suggesting what to add.

| Level | Owner adds | Unlocks |
|---|---|---|
| **Bronze** | Property, tenants, rent | Rent tracking, receipts, reminders, expenses, Summary, basic tax summary, earnings with value growth estimated from rent (value ≈ yearly rent ÷ local gross yield) |
| **Silver** | Purchase price and date (optional rough mortgage owed / payment) | Gain since buying with a value-since-purchase chart, return vs savings / GIC / stocks, rent vs the area by unit (feeds the renewal card), room to borrow (80% of value − owed), monthly value check, rough cash if sold (5% selling costs, before tax) — `src/lib/silver.ts` |
| **Gold** | Closing costs, land transfer tax, and mortgage details (or "paid off") | Mortgage tab, interest vs principal, full taxes with depreciation, cost base and gain if sold |

Earnings always include estimated value growth: today's value × the area's 5-year price trend.

**Property cards.** Each property is a card in its stage's metal (bronze, silver, gold) with a % complete
ring, value, 12-month earnings and its single biggest missing item. Cards are ordered by value; the first
one with something missing is marked "Suggested next". Desktop: 3D tilt toward the pointer and a light
sweep; the suggested or open card glows in its own metal; moving up a stage replays the gleam and glow.

**Keyholder score** (`src/lib/score.ts`): 0–100 from weighted items (name and email, bank connected,
tenants and their contact details, purchase price, purchase costs, mortgage, receipt photos, expense types),
with partial credit. A small chip on Today shows the score and the next gain; tapping it lists items,
biggest gain first. A property's % complete uses the same items.

## Release phases (how we build it) — Phase 1 = Bronze, Phase 2 = Silver, Phase 3 = Gold

| | Stage 1 — front end on sample data | Stage 2 — backend, real data |
|---|---|---|
| **Phase 1 — Run the rental** | ✅ built | next |
| **Phase 2 — Know what it is worth** | ✅ built | after Phase 1 |
| **Phase 3 — Mortgage, tax and capital** | ✅ built | after Phase 2 |

Every feature is assigned to a phase in `src/data/phases.ts`. The UI only shows a feature once its
phase is on, so each phase is a complete app. Moving a feature between phases is a one-line change.
Data entered in an earlier phase carries forward: the phase 2 and 3 fields sit on the same records.

### Phase 1 — Run the rental
Signup questionnaire and plan letter · properties, units, rental share for part-of-home rentals ·
tenants and leases with email-notice consent · rent ledger and tenant statement · confirm rent by hand ·
rent tracking with two choices: mark it paid yourself, or connect any Canadian bank or credit union (read-only) and Keyholder checks it every 4 hours and marks matching rent paid ·
receipts (drafted, approved, superseded on edit) · Gentle / Standard / Firm reminders with grace period
and pause · trust ramp (co-pilot → automatic after 10 unchanged approvals) · expenses with receipt photo,
plain-word categories and the repair-or-improvement question · Today (Pulse, In / Out / Kept, 14-day strip,
door plates, rent roll) · approval tray · Paperwork (receipts, letters, leases, activity log).

### Phase 2 — Know what it is worth
Purchase date and price · value as a range from (a) the purchase price grown by a local home price index,
(b) comparable sales you enter, (c) your own estimate or an appraisal — blended, with confidence, and kept as a
dated history · equity using an approximate mortgage balance · the Worth-It reading against savings / GIC /
stock benchmarks · Benchmark Guide rulers (vacancy, gross yield, expense ratio, price growth).

### Phase 3 — Mortgage, tax and capital
Closing costs, land transfer tax, land share, property tax and insurance · full mortgage with Canadian
semi-annual compounding, amortization schedule and principal / interest split · renewal alert at 120 days ·
capital items with CCA classes · CCA schedule (half-year rule, never creates a loss, off by default for a
home you live in) · Tax Pack in T776 layout with pre-flight checklist, spreadsheet and PDF export ·
adjusted cost base and capital gain estimate.

### Not yet in a phase (from the PRD)
Ontario N4 / N1 / L1 notices with the approval gate and proof of service, vacancy listings and the rental
application form, tenant magic-link page, receipt OCR, accountant share link, forwarding e-Transfer emails
(dropped to keep rent tracking to two choices; the parser in `src/lib/matching.ts` is kept). Decide which phase they belong to.

### Design rules for an older audience
Larger type (17px body, 48px buttons), one main action per row, plain labels ("Mark paid", "Left over",
"To do"), extra fields behind "More details", and later-phase screens hidden rather than shown locked.

## Front door and guidance

- **Public site** in short pages under one menu (☰ with icons on phones): Overview (`#/welcome`), About (province rules and questions; old Provinces and Questions links land there) and Pricing (`#/welcome/<page>`); "Features" (`#/welcome/features`) jumps to the tour on the Overview. Each fact appears once. Overview: a centred hero in the style of notion.com (headline, one short line, four automation pills with icons, Start free / Sign in), then a large browser-style app window under it showing one still app screen (Home: this month's rent; no animation) with a "Maya paid" chip on its corner (hidden on phones), How it works ("3 steps. 15 minutes." on a blue-purple panel: three white step cards with line icons, one short line each and a time chip that adds up to 15 minutes) and Take a closer look (the 8 features with real app screens in a light Mac-style window: feature list or swipeable chips, a highlight on the key button, Previous/Next and "3 of 8", tap to enlarge). One spacing system: 64 px between sections (48 on phones), 24 px from a heading to its content, cards padded 24 px (20), side margins 32 px (16). One type scale on the website, Sign in and signup: 8 sizes (headline 56/36, page title 44/32, section title and prices 32/26, card title 20/18, intro 18/17, body 16, labels 14, fine print 12; the large ones ease between phone and desktop) and 3 weights (400, 600, 700; the wordmark keeps 800). Visitors see Sign in and Start free; only a signed-in account sees Open my dashboard, in the menu bar. The same buttons never show twice at once: the phone's bottom bar and the menu bar's Sign in / Start free step aside while the page's own buttons or the footer are on screen. The menu lights up Features while the tour is on screen; someone with an account in the browser gets Sign in as the main button; Provinces opens on the visitor's province (their account, or a guess from the device's time zone). Every page ends with one light call-to-action card and the footer.
- **Tour screenshots:** `npm run screens` (with the preview server running) retakes all 8 screens at 1440×900, Retina sharpness, with sample data, and records where each highlight goes. On the website they are separate files that load when you reach the tour; the Claude preview embeds them.
- **Positioning: rental automation.** Headline: "Rental automation that gives you your weekends back." Keyholder automates receipts, reminders, rent tracking, bills and mortgage, valuation and the tax summary; late-rent notices and choosing a tenant are always "You approve". Every feature is tagged Automatic or You approve, so the promise stays honest. In Stage 1 the automation is simulated; Stage 2 needs a bank-data provider, an email service and a valuation data source before it is sold for real.
- **Design (bright and friendly):** very light canvas (#F6F7FB) with white cards and soft shadows; indigo #4F46E5 only for actions; green/amber/red only for paid/due/late; a friendly palette (peach, mint, sky, sunshine, lilac, rose) for pictures, icon tiles and category labels. Raleway headings, Inter text with even-width numbers. Real photos of homes on the website (Unsplash, see `docs/CREDITS.md`) and custom illustrations everywhere else (`src/components/Art.tsx`). No property photo uploads.
- **Home ("this month")**: greeting; rent card (collected of expected, progress bar, paid / late / to confirm); since your last visit; your next step; tenant rows with avatars; setup progress. Side column: quick actions, coming up (rent days, lease ends, rent-increase dates, mortgage renewal, tax deadline), last month in review, milestones.
- **Logo:** B, the house key: a key whose head is a little house, white on the indigo-to-violet tile (also the browser-tab icon), next to the word "keyholder" in Raleway.
- **Accounts (Stage 1 preview):** signup starts with "What's your first name?" and uses it along the way ("Nice to meet you, Alex!", "Halfway there", "Last one", "Alex, here's what Keyholder will automate for you", and on Home). After the 6 questions, save the plan with Continue with Google (a stand-in account picker for now) or Continue with email (your full name, filled in, and a simulated sign-in link). Sign in page at `#/signin`, Sign in in the site menu, Sign out in Settings. Stage 2 needs a Google Cloud OAuth client and an email sender for real sign-in.
- **Made for new landlords:** plain-language questions with "Question N of 6" and a reason; plain form names; tap-for-meaning on hard words; Help on every page; Setup progress (was Keyholder score); Since your last visit; see `docs/novice-review.md`.
- **Back and cancel:** signup questions have Back (question 1 goes back to the website) and Exit, and the browser's back button steps through questions (`#/start/<n>`). Tenant and property pages have "Back to …"; on phones, Taxes, Paperwork and Settings have "Back to More". Every panel closes with Cancel, ✕, Esc or a tap outside.
- **Ways in:** "Start free" opens signup (`#/start`). The sample properties open with test / test; the support dashboard with admin / admin. Signed-in users go to Home. The logo and Settings → "What is Keyholder?" open the website again.
- **Guidance in the app:** a 5-step tour (skippable, replay from Settings), a one-line subtitle under each page title, a sample-data banner with "Start with my own", a "Start here" card with progress for new users, and status pills you can tap for a plain explanation.
- **Banks:** connect several banks at once. Withdrawals are read too: bills become expenses (learned per payee), mortgage payments are ticked off against the mortgage, or offer to set one up. Review lives at the top of Paperwork → Expense receipts.
- **Portfolio:** "Your money compared" always shows your return next to savings, a GIC and a stock index fund, using the properties that have a purchase price and listing the ones that don't yet.

## Stage 1 notes
- All data is in `localStorage`. Sample data is dated relative to today.
- Bank linking, email forwarding and sending are **simulated**. The matcher and parser are real code with tests.
- Price index, benchmark and rate figures in `src/lib/jurisdiction.ts` are **placeholders** for design work.
- `src/data/store.tsx` actions (`logPayment`, `confirmMatch`, `saveExpense`, …) are the contract for the Stage 2 API.

## Stage 2 — backend on Render (Node.js)

**Database: PostgreSQL, using Render Postgres (managed).** The ledger needs relational integrity
(payments → leases → units → properties), transactions for "log payment + draft receipt + cancel reminder"
in one step, and an append-only audit table. Postgres covers all of it, and Render runs it as a managed
service with daily backups and point-in-time recovery on paid plans.

| Piece | Render service | Choice |
|---|---|---|
| API | Web Service | Node 22 + TypeScript, Fastify, Zod validation |
| Database | Render Postgres | PostgreSQL; Drizzle ORM with SQL migrations; money as `bigint` cents |
| Jobs | Background Worker + Render Key Value | BullMQ queue (Key Value is Redis-compatible): reminders, email parsing, bank polling, PDFs |
| Schedules | Cron Job | **Every 4 hours: check each connected bank for rent** (`0 */4 * * *`) and mark matches paid; daily reminder drafting; quarterly benchmark refresh |
| Front end | Static Site | This repo, already in `render.yaml` |
| Files | — (Render has no object store) | S3-compatible storage for receipt photos and PDFs, e.g. AWS S3 `ca-central-1` |
| Email | — | Transactional provider (Postmark or SendGrid) for receipts and reminders |
| Bank data | — | Canadian aggregator behind an adapter (Flinks, or Plaid Canada), chosen for coverage of the big banks plus credit unions |
| Auth | — | Managed auth with MFA for owners; magic links for tenants |

**Data residency check.** The PRD asks for data stored in Canada. Render's regions (Oregon, Ohio, Virginia,
Frankfurt, Singapore at last check) do not include Canada. Options: accept US hosting with a privacy review
(PIPEDA allows it with disclosure; Quebec Law 25 needs a privacy impact assessment), keep receipts and documents
in a Canadian S3 region, or move the database to a Canadian provider later. Confirm Render's current regions
before choosing.

### Suggested Stage 2 order
1. Schema + migrations from `src/data/types.ts`, auth, audit log
2. Phase 1 API matching the store actions; swap `store.tsx` from localStorage to API calls
3. Email sending and inbound e-Transfer parsing; reminder cron
4. Bank aggregator adapter
5. Phase 2: valuation sources and benchmark data feeds
6. Phase 3: mortgage and Tax Pack PDF generation server-side

## Several tenants in one unit
Each unit is rented **as a whole** (one lease and one rent shared by any number of people, each with their own name, email and phone; receipts and reminders go to everyone) or **by the room** (each room has its own tenant, lease and rent; the unit shows "2 of 3 rooms rented"; accepting an applicant asks which room, and other applications stay open until the last room is taken). Applications can list several people, each with their own job and income.

## Support dashboard (admin / admin, `#/support`)
Runs on sample support data in Stage 1 (240 landlords, 28 support requests, invoices), labelled "Sample data"; Stage 2 connects the same screens to the backend. Every admin action goes to the audit log. Grouped by how often it is used:
- **Today · Overview:** what needs you now (requests past their reply time, urgent requests, banks not connecting, failed payments, privacy requests due, bounced emails), the last 30 days in six numbers, signups per week, newest landlords, latest admin actions.
- **Support · Inbox:** requests sorted by time left to reply; each with the conversation, saved replies, private notes, priority, assignee, and the landlord's details. **Customers:** search and filters (plan, health, province), and each landlord's page: banks, requests, billing, notes, and actions (resend sign-in link, 30 more free days, change plan, give credit, export data, view the app, delete account).
- **Business · Revenue:** monthly revenue, accounts by plan, failed payments (retry, ask to update card), invoices and refunds. **Growth:** signups per day, the path from visit to bank connected, where people stop in the 6 questions, where they heard about Keyholder, landlords by province.
- **Platform · System health:** problems to fix, banks (working / some failing / many failing), email delivery, automations. **Province rules:** forms per province, verified or being checked, "Checked today". **Announcements:** a one-line message on the website, the app or both.
- **Admin · Privacy & audit:** data requests (copy or delete, due in 30 days) and the full audit log. **Team & settings:** team and roles, reply-time targets, saved replies, security note.
