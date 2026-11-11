# Keyholder: next upgrades (requirements)

Agreed with the owner on 2026-11-11 ("go with your recommendations"). Built in three phases, in order.
Phase 3 waits until the owner has created the Stripe and Plaid accounts.

Status: ☐ to do · ◐ in progress · ☑ done

## Phase 1: fixes (no outside services)

### R1. Sign up first, then the questions ☑
- Order: **Sign up** (Continue with Google, or first + last name, email, password) → **the questions** →
  **"Here's what Keyholder will automate for you"** → **Go to dashboard** → the 5-step tour.
- Google is finished before any question is asked. The plan page has no Google or email boxes.
- The name question is removed (Google or the signup form gives the first and last name).
- Someone who stops halfway has an account; their next sign-in opens the questions.
- "Email me when something needs me" stays on the plan page, above Go to dashboard.
- The browser-only preview follows the same order (with its simulated Google picker and email link).

### R2. No pretend bank on the live site ☑
- Today "Connect a bank" is a simulation: it pretends to connect, adds made-up deposits every few hours and
  counts toward setup progress.
- Live site (server): "Connect a bank" says "Coming soon" until a real bank service is connected (R12).
  The browser-only preview keeps the simulation for demos.
- Setup progress counts only a real bank connection; while banks are off, that step is not listed.
- Clean-up of live accounts: remove the pretend connection, its made-up deposits and any rent those
  deposits marked as paid. Each removal is written to the account's history.

### R3. Sign out: small icon, Settings page only ☑
- On Settings, a small Sign out icon at the top right (next to the setup circle and the Settings icon).
- No other page shows it. The big Sign out button by the Settings title is removed.

### R4. Write to us in its own popup ☑
- Help → "Write to us" closes Help and opens a separate popup: Subject, Message, Send. The confirmation
  shows in that popup.

### R5. Appearance higher in Settings ☑
- Order: Your profile → Appearance → Rent tracking → Receipts and reminders → Data.

## Phase 2: super user and team (no outside services)

### R6. Super user ☐
- The account set as `ADMIN_EMAIL` in Render becomes the **super user** (the email stays in Render, never
  in the code).
- The super user has every admin power plus R7 to R10.
- Only the super user adds, changes or removes team accounts. Two kinds:
  - **Admin**: today's admin ("Owner") powers, without the super-user extras.
  - **Support**: today's Support powers.
- Nobody can remove the super user or change the super user's powers.

### R7. Premium price ☐
- The super user sets the Landlord plan price (today $8 per unit a month) in the dashboard.
- The website's Pricing page and answers update automatically.
- A new price applies to **new subscribers only**; existing subscribers keep theirs.

### R8. Promotions ☐
- Promo codes: % or $ off, for how many months, end date, maximum uses. Pause or end a code.
- Landlords enter a code when they upgrade; the dashboard shows how many times each was used.
- With Stripe on (R11), codes apply at checkout.

### R9. Turn banks off ☐
- One switch turns bank connection off for everyone.
- Single banks can be turned off (e.g. one bank's connection is broken); landlords then see
  "Not available right now" for that bank.

### R10. API keys in the dashboard ☐
- "Connections" page, super user only: Google sign-in, email (Resend), Stripe, bank service (Plaid).
  Each shows its status, a Test button, and lets you enter or replace keys.
- Keys are stored encrypted with `KEYS_SECRET` (a new Render setting). After saving only the last 4
  characters show. Changing a key asks for the password. Every change is logged.
- Keys set in Render keep working; a key saved in the dashboard takes over.

## Phase 3: payments and real bank data (needs the owner's Stripe and Plaid accounts)

### R11. Stripe payments ☐
- Upgrade to the Landlord plan by card on Stripe Checkout (Keyholder never sees card numbers).
- Monthly, per unit. Stripe's billing page: change card, invoices, cancel.
- Promo codes (R8) apply at checkout. The dashboard's Revenue page shows real payments.

### R12. Real bank connection (Plaid), "Link bank" on Income and Expenses ☐
- Plaid: self-serve signup, free test mode, major Canadian banks (RBC, TD, Scotiabank, BMO, CIBC,
  Desjardins, …). Flinks is the alternative if a contract is preferred.
- A small "Link bank" button by the title of Income and Expenses.
- Deposits appear in Income to match to rent; withdrawals appear in Expenses to file. Read-only.
- The server checks for new transactions every 4 hours.
- Real bank data needs Plaid's production approval (a business review, can take a few weeks).
