# Keyholder

A personal assistant for the self-managing Canadian landlord.

This repository is in **Stage 1**: the complete front end for all three product phases, running on
sample data saved in the browser. There is no backend yet. See [docs/PLAN.md](docs/PLAN.md) for the
phase and stage plan and the Stage 2 backend design for Render.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # financial formulas, payment matcher, e-Transfer parser
npm run build      # type-check and build to dist/
```

In the app, **Settings → Build phase preview** switches between Phase 1, 2 and 3. Each phase is a complete app.

Keyboard shortcuts on desktop: `P` log a payment, `E` add an expense, `T` open the tray.

## Deploy to Render

`render.yaml` is a Render Blueprint. In the Render dashboard choose **New → Blueprint**, pick this repo,
and it deploys the static site.

## Layout

```
src/
  data/       types.ts (data model), phases.ts (feature → phase map), seed.ts, store.tsx (actions = future API)
  lib/        finance.ts, matching.ts, templates.ts, tray.ts, jurisdiction.ts (+ tests)
  components/ design system pieces (stamps, door plates, letters, drawers) and forms
  screens/    Onboarding, Today, Rent, PropertyDetail, TenantDetail, Money, Paperwork, Tray, Settings
docs/PLAN.md  phases, stages, backend plan
```
