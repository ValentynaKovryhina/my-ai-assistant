# Weight Tracker Module

**Date:** 2026-11-02
**Status:** ✅ Implemented and tested locally. The migration is **applied to Neon** (approved as W1). **Not committed, pushed or deployed.** Waiting for your review.

---

## 0. Decisions

| # | Decision | Status |
|---|---|---|
| W1 | Apply `20261102090000_weight_tracker` to Neon | ✅ Approved and applied (§3) |
| W2 | Weight precision up to 2 decimals (`DECIMAL(5,2)`) | ✅ Implemented |
| W3 | Duplicate date → explicit **Replace / Cancel** | ✅ Implemented and tested |
| W4 | Historical BMI uses the current height; no stored BMI | ✅ Implemented and tested |
| W5 | Deletion of "Слить воду с орхидей" (observed during inspection) | ✅ Confirmed by the user: deleted intentionally and replaced by the recurring "Орхидеи" task. No restoration needed |
| — | Settings tests only on an isolated local DB (your testing adjustment) | ✅ Done (§6) |
| W6 | Commit, push, deploy | ✅ Approved (§10) |

---

## 1. Architecture

- Same patterns as Task Manager: `requireUser()` first in every page, query and action; Server Actions + `refresh()`; hand-written server-side validation; `server-only` queries; single-user (no `user_id`).
- Reused without modification: `lib/tasks/dates.ts`, `lib/tasks/timezone.ts` (Europe/Prague), `getToday()` and `parseCalendarDate` / `text` / `parseEntityId` from Task Manager, plus the shared UI helpers from `app/tasks/_components/ui.tsx`.
- Task Manager code is unchanged. The only Task Manager file touched is one outdated integration test (§6).

## 2. Data model

| Table | Columns | Notes |
|---|---|---|
| `weight_entries` | `id uuid`, `measured_on DATE` **UNIQUE**, `weight_kg DECIMAL(5,2)`, `created_at`, `updated_at` | One measurement per Prague calendar date. CHECK 20–400 kg |
| `weight_settings` | `id int` (CHECK `= 1`), `height_cm DECIMAL(4,1)`, `goal_weight_kg DECIMAL(5,2)`, `updated_at` | One row created by the migration: **164 cm / 55 kg**. CHECK height 100–250, goal 20–400 |

- **No BMI column.** BMI = `weight / (height_cm/100)²` is calculated on read from the current height, so changing the height recalculates all history (verified on the local DB: no `bmi` column exists).
- Decimals are exact: values go to the DB as normalized strings ("67.3", "67.35"), never as floats.

## 3. Migration (W1)

| Step | Result |
|---|---|
| Live state before | 3 tasks, 1 recurrence rule, 0 occurrences/events/journal/categories; fingerprint unchanged since the review. Weight tables did not exist |
| Backup checksums | ✅ `neondb.dump OK`, `neondb.sql OK`, `rollback_weight_tracker.sql OK` |
| Extra backup | ✅ `neondb-pre-apply.dump`, taken right before applying, because the earlier dump still contained the since-deleted 4th task. Its checksum is added to `SHA256SUMS.txt` |
| Pending | ✅ Only `20261102090000_weight_tracker` (file SHA-256 `649eb3f3…`, unchanged since the review) |
| Statements | ✅ `CREATE TABLE` ×2, `CREATE UNIQUE INDEX` ×1, CHECK ×4 and `INSERT` of the settings row, all on the **two new tables only**. No statement references an existing table |
| `prisma migrate deploy` | ✅ "All migrations have been successfully applied." |
| After | ✅ `migrate status`: "up to date"; `migrate diff` DB ↔ schema: "No difference detected." Settings row `1 / 164.0 / 55.00`; 0 weight entries; all constraints present |
| Task Manager data | ✅ The fingerprints of all 6 Task Manager tables are identical before and after |

Backups: `C:\Valentyna\ITC\db-backups\my-ai-assistant\2026-11-02_pre-weight-tracker\`. Rollback: `rollback_weight_tracker.sql` (tested on a copy), or a restore from `neondb-pre-apply.dump`.

## 4. Features

| Feature | Implementation |
|---|---|
| **Quick add** (prominent card) | Weight field (`inputmode="decimal"`, accepts `67.3`, `67,3`, `67`, up to 2 decimals) and a date (default today in Prague, past allowed, future rejected). The success message names the saved value. Focus returns to the weight field |
| **Duplicate date** | Nothing is saved. An amber prompt shows "You already recorded 67.3 kg on Nov 2. Replace it with 66.9 kg?" with **Cancel** (local reset, no request) and **Replace** (resubmits with `replace=1`; updates the same row in place) |
| **History** | Newest first; date, weight and BMI. Inline **Edit** (weight and date; moving onto an occupied date is rejected with "There is already a measurement on … Edit or delete that one instead.") and **Delete** with inline confirmation |
| **Summary tiles** | Latest weight (+ date), BMI (+ height), goal, difference to goal ("+4.3 kg above goal" / "−0.15 kg below goal" / "at goal"). "—" when there is no data |
| **Settings** | Collapsible card. Height (cm, 1 decimal) and goal (kg, 2 decimals). After saving: "BMI values are recalculated with the new height." |
| **Charts (exactly two)** | Weight (kg) and BMI. Period pills: 1 month, 3 months (default), 6 months, 1 year, all time (`?period=`; an unknown value falls back to 3 months) |
| **Empty states** | No data: "No measurements yet" (tiles show "—"; no charts, no invented values). Data exists but not in the period: "No measurements in the last 1 month — choose a longer period" |
| **Dashboard** | New **Weight** card linking to `/weight` with "67.3 kg · Nov 2" or "No measurements yet." (the card falls back gracefully if the DB is unavailable) |
| **States** | Suspense skeleton, `error.tsx` boundary (retry), pending button labels, inline errors with `aria-invalid` / `aria-describedby`, an `aria-live` success message, 44 px touch targets, 16 px inputs, dark mode |

### Charts

- Server-rendered SVG, no dependency. Same palette as Task Manager (series-1 `#2a78d6` / dark `#3987e5`), 2 px line, ≥ 8 px dots with a surface ring, recessive gridlines.
- **x axis = real dates**, proportional to time. The domain runs from the period start to today (or from the first measurement for "all time"). Points sit on their actual dates.
- **Only recorded measurements** are drawn, joined chronologically with straight segments. Nothing is interpolated or invented. A single measurement is one dot with no line (unit-tested).
- **Goal line:** a dashed line with a "Goal 55.0 kg" label when the goal is within 25% of the plotted values (so ~67 kg vs a 55 kg goal shows it). For a farther goal, a small "Goal … kg ↓/↑" edge label appears instead of flattening the data. The first version used a 12% threshold, which would have hidden your goal; the E2E test caught this.
- Per-point hover tooltips (`<title>`), 12 px hit targets, "Show as table" for each chart, and responsive width (`viewBox`, full width on mobile).

## 5. Security

- `proxy.ts` matcher now includes `/weight/:path*` (optimistic redirect only).
- The page component, all 4 queries (`getWeightOverview`, `getWeightSettings`, `listWeightEntries`, `getLatestWeight`) and all 4 actions call `requireUser()` first. No API routes were added.
- Server-side validation: decimal format (no signs, exponents or spaces), decimal places, ranges, strict dates (2000–2100, not in the future), UUID ids. The DB CHECKs and unique constraint are a second layer.

## 6. Tests and results

| Suite | Result |
|---|---|
| `tsc --noEmit` | ✅ |
| `npm run lint` | ✅ |
| `npm run build` | ✅ `/weight` is a partial prerender (◐) |
| **Unit** `npm test` | ✅ **86/86** (19 new): BMI math and recalculation with another height; goal difference; decimal parsing (dot or comma, normalization, 3 decimals, range, sign, exponent, spaces, `.5`, empty); height with 1 decimal; form date default, retroactive, future and invalid; **Prague vs UTC date** at 23:30 UTC; formatting; period starts (incl. Mar 31 → Feb 28); period filtering and **oldest-first ordering**; empty data; **x proportional to real dates and no fabricated points**; unsorted input; a single point; goal line near, far and realistic |
| **Integration on Neon** `npm run test:db` | ✅ **21/21** (6 new weight + 15 Task Manager). Weight: unauthorized (4 actions + 3 queries) → redirect with nothing changed; create with comma decimal; invalid input not saved; **duplicate → `duplicate` state, value unchanged; `replace=1` → same row updated**; edit; edit onto an occupied date rejected; future date rejected; overview newest-first with BMI from the current height and oldest-first chart data; the 1-year filter excludes old data; delete (idempotent, invalid id rejected) |
| **Integration on an isolated local DB** `npm run test:local` | ✅ **4/4**: initial settings 164/55; **height 164 → 170 recalculates every historical BMI** (24.6/25.0 → 22.9/23.3) and the goal difference; no `bmi` column; invalid settings rejected and unchanged; still exactly one settings row. Ran on a `postgres:18` container restored from `neondb-pre-apply.dump` plus `migrate deploy` (container removed afterwards). `vitest.local.config.mts` **refuses any non-localhost URL** (verified with a fake Neon URL) |
| **HTTP E2E** on the production build (`next start`, signed Auth.js cookies) | ✅ **21/21**: signed out, forged cookie and other account → 307 `/login` on `/weight` with no data; owner: **real empty state** (no charts, no invented data) and the dashboard Weight card; with 3 temporary measurements: both charts, goal line, history, BMI 25.0 at 164 cm, **exactly one dot per measurement per chart**, the 1-month filter, unknown-period fallback; server actions (`createWeightEntry`, `updateWeightSettings`, `deleteWeightEntry`) signed out / other account → redirect |
| **Task Manager regression** (HTTP E2E) | ✅ **60/60** after the dashboard and proxy changes |

**Data safety in tests:**
- Neon tests create only measurements dated **2001**. They refuse to start if any 2001 measurement exists, and delete only collected ids dated 2001.
- **Weight settings are never modified on Neon.** The only settings call there is an unauthorized attempt, rejected before DB access.
- Real measurements, the settings row and all Task Manager tables were fingerprinted before and after every run: **unchanged**.
- Final Neon state: 3 tasks (fingerprint unchanged), 0 weight entries, settings 164.0 cm / 55.00 kg, 0 test leftovers, no test containers running.

**Test changes and notes:**
- The existing Task Manager integration test "pre-migration tasks load as one-time tasks" assumed every real task is one-time. That stopped being true when you created the recurring "Орхидеи" task. It now checks that every real task loads, and that tasks without a recurrence rule are one-time.
- As before, local `next start` needs `AUTH_TRUST_HOST=true`; the HTTP owner checks for server actions prove authorization, not a successful create (see the Task Manager v2 report).

**Bugs found and fixed during implementation:**
1. "Cancel" on the duplicate prompt would have submitted an empty form (showing "Enter your weight"). It's now a local reset.
2. The goal line was hidden for a realistic 12 kg gap (12% threshold) → widened to 25%, with an edge label for far goals.

## 7. Files

| Area | Files |
|---|---|
| Schema / DB | `prisma/schema.prisma` (2 models), `prisma/migrations/20261102090000_weight_tracker/migration.sql` (**applied**) |
| Lib | `lib/weight/{shared,bmi,validation,chart,queries}.ts` (new) |
| App | `app/weight/{page.tsx,error.tsx,actions.ts}`, `app/weight/_components/{quick-add,history,settings-form,line-chart}.tsx` (new); `app/dashboard/page.tsx` (Weight card); `proxy.ts` (matcher) |
| Tests / tooling | `tests/unit/weight.test.ts`, `tests/integration/weight.test.ts`, `tests/integration-local/weight-settings.test.ts`, `vitest.local.config.mts` (new); `tests/integration/task-manager.test.ts` (one outdated assertion); `package.json` (`test:local` script; no new dependencies) |
| Reports | `claude-reports/weight-tracker.md`, `README.md` |

## 8. Known limitations

- No global navigation bar exists in the app; the module is reached from the dashboard card (as Tasks is).
- The history shows all measurements (up to 5000) on one page with no pagination. That's fine for personal use, even with daily measurements.
- Chart tooltips use native SVG `<title>` (hover on desktop, long-press on some mobile browsers); every value is also in "Show as table" and the history.
- BMI is shown without categories or advice (by design: no medical recommendations).
- Not tested in a real browser or on Android; verified through server-rendered HTML, actions and HTTP.

## 9. Deployment (after approval)

1. The database is ready (migration applied). The current production code is unaffected by the new tables.
2. Commit: code, schema, migration, tests, `vitest.local.config.mts`, `package.json`, reports (plus the pending Task Manager v2 report update). Not committed: `.env*`, `generated/`, backups.
3. Push → Vercel. No new environment variables.
4. Manual checks after deploying (signed in, on the phone):
   - [ ] Dashboard → Weight card → `/weight` shows the empty state.
   - [ ] Add `67,3`, check the tiles (BMI 25.0, +12.3 kg above goal).
   - [ ] Add a value for yesterday, then add another one for the same date → Replace / Cancel prompt; try both.
   - [ ] Edit a measurement, then delete one (with confirmation).
   - [ ] Switch the chart periods; check the goal line and that points sit at their real dates.
   - [ ] Settings: change the height and see the BMI values change; then change it back.
   - [ ] Dark mode and touch targets on Android.
