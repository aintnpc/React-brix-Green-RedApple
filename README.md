# brix

React Native monorepo. Two iOS-first fitness coaching apps sharing a common component and utility layer.

---

## Apps

### green-apple — Diet Coach (`apps/green-apple`)

**Catchphrase:** 4kg in 2 weeks

A calorie-deficit coaching app targeting 2030 women aiming for 2–5 kg weight loss. The core loop: user photos a meal → AI estimates calories → app back-calculates the exact exercise prescription needed to hit today's deficit goal.

| Item | Value |
|---|---|
| Bundle ID | `app.brix.greenapple` |
| Monetization | RevenueCat — credit pass model (1week / 2week / 2week_x3) |
| Backend | Supabase |
| Auth | Apple Sign-In, Google Sign-In |

**Key screens:** Onboarding (5 steps) → Paywall → Home (Activity Rings) → Diet tab (photo flow) → Exercise tab (timer flow) → Profile

**Differentiator:** Unlike Cal AI which stops at calorie measurement, green-apple back-calculates and prescribes exact exercise. Same UX sequence has no direct competitor.

---

### red-apple — Bodybuilding Coach (`apps/red-apple`)

**Target:** Bulk/cut cycle, 12-week program

Shares green-apple's structural shell but replaces calorie-deficit logic with bodybuilding-specific coaching: protein targets, weekly volume, muscle group splits (full body / upper-lower / PPL), and a body measurement tracker.

| Item | Value |
|---|---|
| Bundle ID | `app.brix.redapple` |
| Monetization | RevenueCat — TBD (IAP stub in place) |
| Backend | Supabase (separate project) |

**Key differences from green-apple:**

| | green-apple | red-apple |
|---|---|---|
| Goal | −4kg / 2 weeks | +muscle / 12 weeks (bulk/cut) |
| Coach logic | Calorie deficit back-calc | Calorie surplus + protein target |
| Exercise tab | Duration tracking (min) | Sets × reps × weight |
| Diet tab | Calorie-primary | Protein-primary |
| Records tab | Weight graph | Weight + body measurements |

---

## Packages

| Package | Description |
|---|---|
| `packages/shared` (`@repo/shared`) | Types, Supabase client, shared logic |
| `packages/theme` (`@repo/theme`) | Color tokens, typography scale |
| `packages/ui` (`@repo/ui`) | Shared React Native components |

---

## Stack

- **Framework:** Expo (React Native + TypeScript)
- **Navigation:** expo-router
- **State:** Zustand
- **Data fetching:** TanStack Query
- **Payments:** RevenueCat (expo-iap)
- **Backend:** Supabase
- **Monorepo:** pnpm workspaces

---

## Commands

```bash
pnpm green     # start green-apple (diet coach)
pnpm red       # start red-apple (bodybuilding coach)

pnpm build:shared
pnpm build:ui
pnpm build:theme
```

---

## Structure

```
brix/
├── apps/
│   ├── green-apple/     # diet coaching app
│   └── red-apple/       # bodybuilding coaching app
├── packages/
│   ├── shared/
│   ├── theme/
│   └── ui/
└── supabase/
```
