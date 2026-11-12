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
  deposits marked as paid. Each removal is written to the account's history. Real Plaid connections (R12) and
  their transactions are never removed, even while banks are turned off.

### R3. Sign out: small icon, Settings page only ☑
- On Settings, a small Sign out icon at the top right (next to the setup circle and the Settings icon).
- No other page shows it. The big Sign out button by the Settings title is removed.

### R4. Write to us in its own popup ☑
- Help → "Write to us" closes Help and opens a separate popup: Subject, Message, Send. The confirmation
  shows in that popup.

### R5. Appearance higher in Settings ☑
- Order: Your profile → Appearance → Rent tracking → Receipts and reminders → Data.

## Phase 2: super user and team (no outside services)

### R6. Super user ☑
- The account set as `ADMIN_EMAIL` in Render becomes the **super user** (the email stays in Render, never
  in the code).
- The super user has every admin power plus R7 to R10.
- Only the super user adds, changes or removes team accounts. Two kinds:
  - **Admin**: today's admin ("Owner") powers, without the super-user extras.
  - **Support**: today's Support powers.
- Nobody can remove the super user or change the super user's powers.

### R7. Premium price ☑
- The super user sets the Landlord plan price (today $8 per unit a month) in the dashboard.
- The website's Pricing page and answers update automatically.
- A new price applies to **new subscribers only**; existing subscribers keep theirs.

### R8. Promotions ☑
- Promo codes: % or $ off, for how many months, end date, maximum uses. Pause or end a code.
- Landlords enter a code when they upgrade; the dashboard shows how many times each was used.
- With Stripe on (R11), codes apply at checkout. (Phase 2 built creating, pausing and ending codes; the use count
  starts once checkout exists.)

### R9. Turn banks off ☑
- One switch turns bank connection off for everyone.
- Single banks can be turned off (e.g. one bank's connection is broken); landlords then see
  "Not available right now" for that bank.

### R10. API keys in the dashboard ☑
- "Connections" page, super user only: Google sign-in, email (Resend), address lookup (Google Places), Stripe,
  bank data (Plaid), property values (AVM). Grouped "In use" and "Coming"; the preview shows the same list.
  Each shows its status, a Test button, and lets you enter or replace keys.
- Keys are stored encrypted with `KEYS_SECRET` (a new Render setting). After saving only the last 4
  characters show. Changing a key asks for the password. Every change is logged.
- Keys set in Render keep working; a key saved in the dashboard takes over.

### R13. Address autocomplete (Google Places) ☑
- Typing a property address suggests Canadian addresses; picking one fills street, city, province, postal code
  and the map position. Through the server (the key never reaches the browser), signed-in people only, 60 a
  minute each. Plain box until the key is set on Connections. The preview suggests from sample addresses.

### R14. Overview map ☑
- Support → Overview: a map of Canada (provinces drawn in), one dot per city where landlords' rentals are,
  bigger for more landlords, with the busiest places listed. City level only, never street addresses.

### R15. Admin sees only the dashboard ☑
- No "Sample landlord app" button; admin / admin in the preview opens only the support dashboard too.

## Phase 3: payments and real bank data (needs the owner's Stripe and Plaid accounts)

### R11. Stripe payments ☐
- Upgrade to the Landlord plan by card on Stripe Checkout (Keyholder never sees card numbers).
- Monthly, per unit. Stripe's billing page: change card, invoices, cancel.
- Promo codes (R8) apply at checkout. The dashboard's Revenue page shows real payments.

### R12. Real bank connection (Plaid), "Link bank" on Income and Expenses ☑
- Plaid (chosen over Flinks by the owner): Plaid Link for the landlord to sign in to their bank, then read-only
  transactions. Self-serve signup and a free sandbox to build and test with; major Canadian banks.
- A small "Link bank" button by the title of Income and Expenses.
- Deposits appear in Income to match to rent; withdrawals appear in Expenses to file. Read-only.
- Real time, without extra Plaid charges: Plaid keeps its own copy of each bank up to date and tells Keyholder
  (a signed webhook) as soon as it has new transactions; Keyholder reads them from Plaid's copy
  (`/transactions/sync`, included in Plaid's monthly fee per connected bank). "Check now" does the same read.
  Keyholder never asks a bank for fresh data (`/transactions/refresh`, billed per request).
- Disconnecting a bank (or deleting the account) removes the connection at Plaid too, so it stops being billed.
- A deposit that clearly is a tenant's rent is marked paid (receipt drafted); others wait to be confirmed. Bills
  from a vendor filed before are filed again the same way.
- Real bank data needs Plaid's Production access (a business review; some Canadian banks also need an OAuth
  registration that can take weeks: start early).

### R16. Property values (AVM) ☑ (Repliers; Teranet / RPS once their API documentation is in hand)
- An estimated market value for each property, updated monthly, from an AVM provider. Recommended: Repliers
  Estimates to start (documented API, values from an address); Teranet (Home Value Range) for lender-grade
  values; RPS also estimates rents. MLS® (CREA DDF) has no sold prices and needs a REALTOR® and a CREA
  agreement, so it is not used for values. The Connections page has the slot (provider + API key).
- Until a provider is connected, values come from the purchase price and a market index, labelled estimates.
- Built (owner, 2026-11-12: "show the Repliers estimate even before the purchase price or mortgage"):
  - Repliers' API (docs.repliers.io/reference/create-an-estimate) needs the postal code, bedrooms, bathrooms,
    square feet, and the property type and style as the MLS board writes them. The property's Value page asks
    for these once ("Get this home's value from Repliers"), with type and style picked from the board's own list.
    No purchase price or mortgage needed.
  - The value shows on the Value page and the property card: "Worth about $X, likely between $low and $high ·
    Repliers Estimates · date · usually within about N%". Where the owner lives in part of the home, the whole
    home's value and the rented share are both shown. Refreshed about once a month.
  - If Repliers cannot value a home (add-on off, a field it does not accept…), the Value page shows Repliers'
    reason and "Try again"; Support → Health logs it.
  - The server keeps each answer 30 days per home (address and details), so a home is paid for once a month;
    corrected details ask again.
  - Without a provider the figure is labelled "Rough estimate from the rent, not an appraisal" or "Estimate from
    what you paid and the local price trend" ("Sample AVM (placeholder)" is gone).
  - Connections → Property values: optional Repliers board ID (for a key that covers more than one MLS board).
    Test checks the key, lists the board's types, styles and boards, and values a sample home.

### R19. Comparison rates ☑
- "Your money is earning" compares a property's return with high-interest savings, a 5-year GIC and a broad stock
  index fund. These were fixed placeholder numbers (2.75%, 3.6%, 7.5%).
- 5-year GIC: the Bank of Canada's weekly figure for the big banks' posted 5-year GIC rate (Valet API, series
  V80691341, free, no key), read by the server each day. 2.75% for the week of Nov 4, 2026.
- High-interest savings and the stock index fund have no official rate: the super user sets them on Price &
  promotions → Comparison rates. Each rate shows its source and date in the app.

### R17. Tenants older than Keyholder: in good standing? ☑
- Adding a tenant whose lease started before this month asks: are they in good standing, and the last month
  they paid rent in full. Months up to then count as paid ("Paid before Keyholder" in the ledger).
- Tenancies added before this question existed, showing unpaid months from before the landlord started
  Keyholder, get the same question on Home and on the tenant's page, once.

### R18. Bigger Settings and Sign out ☑
- Computers: labelled buttons (icon + word, 44px tall) at the top right; Sign out on the Settings page only.
- Phones: larger icons with the word under each. The support dashboard's Sign out is a bordered button too.
