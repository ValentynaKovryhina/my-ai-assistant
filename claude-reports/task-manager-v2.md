# Task Manager v2: Planning, Recurrence, Activity Journal, Analytics

**Dates:** 2026-11-01 – 2026-11-02
**Status:** ✅ Implemented and tested locally. The migration is **applied to Neon** (approved as D10). **Not committed, pushed or deployed.** Waiting for your review.

---

## 0. Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | No separate Neon dev branch or database. Use the existing DB with inspection, a verified backup, SQL review and approval | ✅ User decision |
| D2 | Schema and migration (incl. `due_date` → `DATE`) | ✅ Approved and applied |
| D3 | `vitest` as the only new devDependency | ✅ Installed **`vitest@^4.1.12`**. `vitest@5` needs `@types/node ≥ 22`, which would have forced a types upgrade; v4.1 supports the project's `@types/node@20` without `--force` |
| D4 | Hand-written SVG charts | ✅ Implemented (no chart library) |
| D5 | `APP_TIME_ZONE` (default `Europe/Prague`) replaces the IP-based "today" | ✅ Implemented |
| D6 | Short months clamp to the last day | ✅ Implemented and tested |
| D7 | Completed, missed and skipped shown separately; both rates shown with formulas; skipped never silently dropped | ✅ Implemented |
| D8 | Missed-policy defaults: SKIP_MISSED (calendar), KEEP_OVERDUE (window) | ✅ Implemented; editable per task |
| D9 | Reopening never deletes history (occurrence → `OPEN`, append-only events, journal kept) | ✅ Implemented and tested |
| D10 | Apply `20261101120000_task_manager_v2` to Neon | ✅ Approved and applied (§4) |
| **D11** | **Commit, push, deploy** | ⏳ **Waiting for your approval** |

---

## 1. Existing architecture findings (from Phase 1)

- Next.js 16.4.3 (`cacheComponents`, `partialPrefetching`), React 19.3, Prisma 7.10 (`PrismaPg`), Auth.js v5 beta (JWT, single-user allowlist), Tailwind 4.
- v1: a single `Task` model, Server Actions + `refresh()`, hand-written validation, `server-only` queries, and `lib/dal.ts` (`requireUser()`) for authorization. All of these patterns are reused.
- `.env` holds the only `DATABASE_URL`, shared by local dev and Vercel Production (D1).

---

## 2. Data model (implemented)

| Table | Purpose |
|---|---|
| `tasks` (extended) | Task definition. Existing columns kept, `due_date` is now `DATE`. New: `schedule_type`, `tracking_mode`, `estimated_minutes`, `start_date`, `completed_at`, `completed_on`, `category_id` |
| `categories` | User-defined categories; `normalized_name` UNIQUE (case-insensitive) |
| `recurrence_rules` | **Versioned** schedule (`effective_from` / exclusive `effective_to`) |
| `task_occurrences` | Occurrences the user acted on: `OPEN` / `COMPLETED` / `SKIPPED`, **UNIQUE (task_id, scheduled_date)** |
| `completion_events` | **Append-only** history: COMPLETED / SKIPPED / REOPENED |
| `activity_entries` | Journal: the **only** source of actual minutes |

Pending, upcoming and missed occurrences are **computed**, never stored, so no background scheduler is needed and generation is idempotent by construction. Calendar values are `DATE`; real instants are `timestamptz`. DB CHECK constraints guard minutes (1..1440), intervals, days and weekdays.

---

## 3. Migration safety (Phase 2, summary)

- **Before:** read-only inspection found 3 tasks (all TODO), 1 applied migration, 0 non-midnight due dates. `pg_dump 18.6` backup (custom format + plain SQL) taken over the direct endpoint, saved outside the repo, **restore verified** in a throwaway local container (identical fingerprint). The SQL review found no DROP, DELETE or TRUNCATE. Dry runs passed on restored copies (real data, DONE backfill, guard abort, empty DB, rollback script).
- **Backup location:** `C:\Valentyna\ITC\db-backups\my-ai-assistant\2026-11-01_pre-task-manager-v2\` (`neondb.dump`, `neondb.sql`, `rollback_task_manager_v2.sql`, `SHA256SUMS.txt`).
- **Rollback options:** a tested reverse script (drops v2 data), a full restore from the dump, or Neon point-in-time restore.

---

## 4. Applying the migration (D10)

| Step | Result |
|---|---|
| Fingerprint before | ✅ `tasks 3 · 5f5bde5a…`, `migrations 1 · f6ff5596…`, identical to the recorded values |
| Backup checksums | ✅ `sha256sum -c`: `neondb.dump OK`, `neondb.sql OK`, `rollback_task_manager_v2.sql OK` |
| Pending migrations | ✅ Only `20261101120000_task_manager_v2` (file unchanged since the dry runs) |
| `prisma migrate deploy` | ✅ "All migrations have been successfully applied." Only this migration ran. No reset, no wipe |
| Existing tasks | ✅ 3 tasks, same ids, titles, status, priority and timestamps. The v1-shape hash is **identical** to the pre-migration hash. `due_date` 2026-11-02 kept (type `date`), all `ONE_TIME` + `COMPLETION` |
| Status / drift | ✅ `migrate status`: "Database schema is up to date!" `migrate diff` DB ↔ schema: "No difference detected." |
| After all testing | ✅ The 3 existing tasks are still byte-identical; 0 test records and 0 test categories remain |

---

## 5. Features implemented

### 5.1 Scheduling behaviors

| Type | Behavior |
|---|---|
| **A** One-time | Title, description, priority, estimate, category. Active until completed or cancelled |
| **B** Deadline | Optional "available from" date plus deadline. Overdue status and urgency chips (overdue / today / ≤3 days / ≤7 days). **Priority is never changed automatically**; urgency is computed separately |
| **C** Calendar | Every N days, weekly on chosen weekdays every N weeks, monthly on a day every N months. Anchored to the calendar: a late completion never moves the schedule. Per-occurrence state and history |
| **D** Monthly window | Available from day X, due by day Y, every N months. One completion per period; completing on Nov 3 → next period opens Dec 1 |
| **E** After completion | Next due = **actual** completion date + N days or weeks. Due Nov 7, completed Nov 10 → next due Nov 17. Exactly one pending item: no duplicates for missed intervals. The actual date is preserved |

- **Missed policy** (per task): KEEP_OVERDUE lists past unresolved occurrences (oldest 10 shown, with complete or skip per occurrence and "Skip all N missed"). SKIP_MISSED hides them and continues. In analytics they count as **missed** under both policies.
- **Short months:** days 29–31 clamp to the month's last day (31 → Feb 28/29, Apr 30). Window start and due days clamp independently, and start ≤ due is enforced. Year boundaries and leap years are tested.
- **Rule edits** close the current rule version (effective until today) and start a new one, so past statistics keep the old schedule. A change to the missed policy only updates in place. Stored occurrences always count even if a new rule no longer produces their date.

### 5.2 Completion and reopening (history preserved)

- Completing writes the task status (one-time) or upserts the occurrence (recurring), plus a `COMPLETED` event. A retroactive completion date is allowed (never in the future).
- **Idempotent:** a double submit or two concurrent requests produce one row, one event and one journal entry (tested with `Promise.all`).
- **Reopen:** a one-time task goes back to TODO, and an occurrence becomes `OPEN` (row kept). A `REOPENED` event is appended. **Earlier events and all journal entries are kept**; time actually spent still counts once.
- **Cancel task** keeps everything (the safe alternative to delete). **Delete** asks for confirmation and warns that the history will be removed.

### 5.3 Estimated vs actual duration, tracking settings

- `estimated_minutes` (planning) lives on the task and is never counted as actual time.
- **Tracking mode** (editable): *Completion only* (one-tap complete) · *Time spent* · *Completion and time*. With time tracking, completing opens a small panel: date, minutes spent (optional), note.
- No timer: all time is entered manually.

### 5.4 Activity journal

- Log an activity with a date (retroactive allowed, never future), optional minutes and an optional note. Several entries per day are allowed. You can log time with no scheduled occurrence (spontaneous study), and edit or delete entries (with confirmation).
- **Never completes anything automatically.** An optional "Also complete an occurrence?" selector (or "Also mark the task as completed" for one-time tasks) does it explicitly. The entry and the completion are saved in **one transaction**, and the entry is linked to the occurrence.
- **No double counting:**
  - Minutes come only from journal entries.
  - Completing with minutes creates exactly one linked entry.
  - If time was already logged that day, the completion panel offers "Use the N min already logged", which links those entries instead of adding minutes (tested).

### 5.5 Analytics (`/tasks/[id]/analytics`)

- **Ranges:** this week (Monday start), this month, last 3 months, this year, all time. All are in Prague dates and computed from DB records.
- **Time:** total, sessions, average session, active days, and a bar chart per day / ISO week / month / year (chosen by range length), with per-bar hover tooltips and a "Show as table" view. Also this week / month / year totals.
- **Regularity (calendar and window):** separate **Completed** (with "N late"), **Missed**, **Skipped** and **Open now** counts. Both rates are shown **with their formulas**: `completed ÷ scheduled` and `completed ÷ (scheduled − skipped)`. Scheduled = completed + missed + skipped; open and future occurrences are never counted as missed. Current and longest streak are all-time; a missed or skipped occurrence ends a streak.
- **Visuals:** month grids for calendar tasks (✓ / ✕ / – / ○ / · icons plus colors, a legend, and a dot for journal days; the latest 12 months are shown); a period list for window tasks.
- **Completion-based (E):** completion dates, average actual interval, late count and average delay. A late completion counts **once**, never as several missed occurrences.
- **Charts** follow the dataviz skill: one series hue (validated `series-1` #2a78d6 / #3987e5 in dark mode), reserved status colors always paired with an icon and a label, a 2 px gap between bars, 4 px rounded data ends, and recessive gridlines.

### 5.6 Quick task finder (`/tasks/find`)

- 5 / 15 / 30 / 60 minute buttons plus a custom 1..1440 field.
- Shows only **actionable** tasks: not completed, not cancelled, and available now. That means one-time tasks whose start date has passed, recurring tasks with an open or overdue occurrence, and flexible tasks once due.
- A task needs an estimate ≤ the budget. **Tasks without an estimate are never assumed to fit**; the page shows a count of them, plus a count of tasks that take too long.
- **Sort:** urgency (overdue → today → ≤3 days → ≤7 days → none), then priority, then the estimate closest to the budget, then the earliest deadline.

### 5.7 Categories

- Optional, user-defined (not an enum). Managed at `/tasks/categories` (add, rename, delete; deleting makes its tasks uncategorized). You can also create one inline from the task form (an existing name is reused, case-insensitively).
- `/tasks` gets a category filter row (`?category=<id>|none`), combined with the existing All / Active / Completed / Overdue filters.

---

## 6. UI routes and components

| Route | Content |
|---|---|
| `/tasks` | Unified list. Quick create (title, deadline, priority) with **"More options"**: description, estimate, category, **Repeat** (Doesn't repeat / On a schedule / Monthly window / After completion; only the relevant fields appear), tracking. Existing filters plus category filter. One-tap complete or reopen; tasks that track time open the minutes panel. Chips separate **deadline** (urgency colors) from **repeat** (repeat icon and rule) |
| `/tasks/[id]` | Summary, current occurrence (complete / skip / reopen), overdue occurrences, upcoming dates, activity journal, completion history, edit / cancel / delete, link to analytics |
| `/tasks/[id]/analytics` | Range pills, stat tiles, rates with formulas, streaks, bar chart, calendar or period list |
| `/tasks/find` | Quick finder |
| `/tasks/categories` | Category management |

- **New components** (in `app/tasks/_components/`): `ui.tsx` (shared styles and layout), `complete-control.tsx`, `journal.tsx`, `task-manage.tsx`, `charts.tsx`, `category-manager.tsx`. `task-form.tsx` and `task-item.tsx` are extended.
- **New server actions:** `actions.ts` (create, update, complete, reopen, skip, skip-missed, cancel/restore, delete, plus a v1-compatible `setTaskCompleted`), `journal-actions.ts`, `category-actions.ts`.
- **New `lib/tasks/` modules:** `recurrence.ts` (pure engine), `analytics.ts`, `finder.ts`, `view.ts`, `timezone.ts`, `mutations.ts` (transactions), plus extended `dates.ts`, `shared.ts`, `validation.ts` and `queries.ts`.
- **States and UX:**
  - Loading skeletons in Suspense, empty states, and the existing error boundary.
  - Inline confirmations for delete and "Skip all", with no browser dialogs.
  - 44 px touch targets, 16 px inputs, `aria-invalid` / `aria-describedby`, and labelled controls.
  - Dark mode and safe-area padding.
  - The dashboard card now counts recurring tasks too.

---

## 7. Security

- Every page component, query (`getTaskList`, `getTaskDetail`, `getTaskAnalytics`, `listTaskViews`, `listCategories`, `getTaskCounts`) and every server action calls `requireUser()` **first**. `proxy.ts` already covers `/tasks/:path*`. No new API routes.
- All inputs are validated server-side. Strict enums, dates (2000–2100, no future completion or journal dates), minutes 1..1440, intervals per unit, window start ≤ due, UUIDs, and text lengths.
- **Occurrence dates are re-validated against the rule on the server** (future or unscheduled dates are rejected; a window must be open). Untrusted extra fields (`status`, ids, ownership) are ignored.
- Errors shown to the user are generic, and logs contain only `error.message`.

---

## 8. Tests and results

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ |
| `npm run lint` | ✅ |
| `npm run build` | ✅ All new routes are partial prerenders (◐) |
| **Unit tests** `npm test` (Vitest) | ✅ **67/67**: dates and DST (Prague spring-forward and fall-back nights, UTC vs Prague midnight); recurrence A–E; every Wednesday; Mon+Fri every 2 weeks across the year boundary; monthly on the 31st (Feb 28/29, Apr 30); windows (Nov 3 → Dec 1, short months, mid-month start, Dec → Jan); missed policies; reopened occurrences; flexible Nov 7 → 10 → 17, weeks, no duplicates; rule versions and orphan rows; server-side slot validation; analytics (ranges, multiple same-day and retroactive entries, buckets, totals, separate completed/missed/skipped counts, both rates, future not missed, early window completion, streaks, flexible late-once); finder; validation (estimate vs actual minutes, rules, enums, injection fields); v1 compatibility (status mapping, legacy due dates) |
| **Integration tests** `npm run test:db` (real actions + Neon) | ✅ **15/15**: unauthorized (14 actions + 3 queries redirect, nothing changes); existing tasks load unmodified; one-time with estimate vs actual, idempotent double submit, reopen keeps events and entry, delete cascades; calendar KEEP_OVERDUE, **concurrent double completion → 1 row / 1 event / 1 entry**; future and unscheduled dates rejected; skip and skip-all; reopen keeps the row, events and journal; journal with multiple same-day and retroactive entries, edit and delete, no auto-completion; rule versioning; cancel/restore; explicit journal completion counted once; "use logged time" link; window one-per-period; flexible recalculation from the actual date; categories (case-insensitive duplicates, inline reuse, filter, delete → uncategorized) |
| **HTTP E2E** on the production build (`next start`, locally signed Auth.js cookies) | ✅ **60/60**: signed out, forged cookie and other account get 307 → `/login` on all 5 new routes with no private data; the owner sees correct content on 11 pages (list, category filter, detail, analytics with formulas, window, flexible, finder 15/5, categories, dashboard); unknown or malformed id → "Task not found"; **server action over HTTP**: signed out / other account → redirect, nothing created; owner → passes auth and server-side validation answers |
| Data safety | ✅ Test rows used the `__claude_e2e__` prefix and were deleted by collected id + prefix only. The non-test task fingerprint was identical before and after every run. 0 leftovers |

**Test notes:**
- Local `next start` needs `AUTH_TRUST_HOST=true` (Auth.js trusts the host automatically only on Vercel or under `next dev`), as noted in the authentication report. The first E2E run without it correctly redirected the owner too (Auth.js failed closed).
- In the HTTP owner action check, the hand-built React action encoding delivered empty fields, so it proves authorization plus validation rather than a successful create. Successful mutations are covered by the integration tests, which call the same actions.
- In the integration tests, `requireUser` and Next request APIs are mocked. Real authentication is covered by the HTTP E2E.

**Issues found and fixed during implementation:**
1. A journal entry with "complete occurrence" first used two transactions and linked *all* unlinked entries of that day. It was rewritten into one transaction that links only the new entry.
2. The inline completion panel rendered between the checkbox and the title in the list; fixed with `order-last`.
3. Migration preparation: the `$$` quoting bug was found by the dry run (see §3).

---

## 9. Known limitations

- **Scale:** list, finder and dashboard load all tasks (cap 500) with their rules and occurrence rows, and compute states in memory. This is fine for personal use. A daily task kept for many years adds about 365 rows per year.
- **Overdue lookback:** KEEP_OVERDUE considers the last 366 days. "Skip all missed" covers the same window.
- **Calendar view** shows the latest 12 months (the numbers cover the whole range). The journal shows the latest 100 entries (analytics use all).
- **No "ends on" UI:** the engine supports `ends_on`, but the form doesn't expose it yet. To stop a recurring task, cancel it.
- **Flexible tasks can't be skipped** (only completed, early or late), by design.
- **Unknown task ids** render "Task not found" with HTTP 200, because it is streamed inside Suspense under Cache Components; the page also gets a `noindex` tag.
- **Prisma warning:** `@prisma/adapter-pg` prints a `pg` DeprecationWarning ("client.query() when the client is already executing a query") when Prisma runs relation queries in parallel inside interactive transactions. It comes from Prisma, not app code, and results are correct. It needs a Prisma/pg update before `pg@9`.
- **Not tested in a real browser or on Android:** verified through server-rendered HTML, actions and HTTP. A manual pass on the phone is recommended (checklist below).
- **v1 note:** completion sorting now uses `completed_at` (`updated_at` for older rows).

---

## 10. Deployment requirements (when approved)

1. **Database:** nothing more to do; the migration is already applied to Neon. The v1 code currently in production keeps working against the new schema.
2. **Commit** (after your approval): the code, schema, migration folder, tests, Vitest configs, `package.json` / `package-lock.json` (adds `vitest`) and the reports. Not committed: `generated/`, `.env*`, the backups (outside the repo).
3. **Push → Vercel deploy.** The build runs `prisma generate` via `postinstall`; no new environment variables are required.
4. **Optional:** `APP_TIME_ZONE` in Vercel only if you ever want a zone other than `Europe/Prague`. It is not needed now.
5. **After deploying, check on your phone:**
   - [ ] Create a task with only a title; then one with "More options" → Repeat → On a schedule → weekly Mon/Fri.
   - [ ] A monthly window task (1st → 25th): complete it and see "Done for this period".
   - [ ] A completion-based task (7 days): complete it, and check that the next due date is 7 days later.
   - [ ] On a time-tracking task: tap complete, enter minutes, then open analytics.
   - [ ] Journal: log 20 min, log a past date, edit, delete.
   - [ ] Reopen a completion and check that the history shows Completed + Reopened.
   - [ ] Find: 15 min. Categories: add one, filter by it.

---

## 11. Files changed

| Area | Files |
|---|---|
| Schema / DB | `prisma/schema.prisma`, `prisma/migrations/20261101120000_task_manager_v2/migration.sql` (applied) |
| Lib | `lib/tasks/{dates,shared,validation,queries}.ts` (changed); `lib/tasks/{recurrence,analytics,finder,view,timezone,mutations}.ts` (new) |
| App | `app/tasks/{page,actions}.tsx/ts` (changed); `journal-actions.ts`, `category-actions.ts`, `[id]/page.tsx`, `[id]/not-found.tsx`, `[id]/analytics/page.tsx`, `find/page.tsx`, `categories/page.tsx` (new); `_components/{task-form,task-item}.tsx` (changed), `_components/{ui,complete-control,journal,task-manage,charts,category-manager}.tsx` (new) |
| Tests / tooling | `tests/unit/*` (5 files), `tests/integration/task-manager.test.ts`, `tests/stubs/server-only.ts`, `vitest.config.mts`, `vitest.db.config.mts`, `package.json` (`test`, `test:db`, `vitest`), `package-lock.json` |
| Unchanged | `auth.ts`, `lib/dal.ts`, `proxy.ts`, `app/dashboard/page.tsx` (it uses the updated `getTaskCounts`), env files |
