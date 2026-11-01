# Task Manager Module

**Date:** 2026-11-01
**Status:** ✅ Implemented, tested locally and approved by the user. Committed (`5dd97fd`), pushed to `origin/main`, and deployed to Vercel Production. Production checks passed.

## Summary

The first functional module: a mobile-first **Tasks** page at `/tasks`, linked from the dashboard. You can create, edit, complete, reopen and delete tasks, with a title, optional description, optional due date and priority. Filters: **All / Active / Completed / Overdue**.

- Uses the existing `Task` model, Prisma client and Neon database. **No schema change and no migration.**
- Every page, Server Action and query checks authorization on the server through the existing `lib/dal.ts` helpers.
- No new dependencies. Validation is a small hand-written module; `zod` exists in `node_modules` only as a transitive dependency and is not used.
- No AI, push notifications or recurring tasks.

## Schema review: is a migration needed? No.

| Requirement | Existing schema | Decision |
|---|---|---|
| Title, description (optional), priority | `title`, `description?`, `priority TaskPriority` (LOW, MEDIUM, HIGH, URGENT) | Used as is |
| Due date (optional) | `dueDate DateTime?` → `due_date timestamp(3)` | Used as a **date-only** value, stored as midnight UTC of the chosen day, so it never shifts with time zones |
| Complete / reopen | `status TaskStatus` (TODO, IN_PROGRESS, DONE, CANCELLED) | Complete → `DONE`, reopen → `TODO`. `IN_PROGRESS` counts as active. `CANCELLED` is not created by the UI; it appears only under All and is treated as closed |
| Filters and sorting | Indexes on `status` and `due_date` | Enough for a personal list |
| Ownership | No `userId` column | Not needed: the app is single-user, and access is limited to `ALLOWED_GOOGLE_EMAIL` on the server. Every task belongs to the owner, so no ownership data is ever taken from the client. A `userId` column and migration would only be needed if the app becomes multi-user |
| "Completed at" | Not present | Completed tasks are sorted by `updatedAt`, which is good enough. A `completedAt` column can be added later if completion history matters |

## Architecture

```
app/tasks/page.tsx              Page: static shell (header and new-task form) plus a streamed list inside <Suspense>
app/tasks/actions.ts            Server Actions: createTask, updateTask, setTaskCompleted, deleteTask
app/tasks/error.tsx             Error boundary: "Couldn't load your tasks" with Try again (retry) and Dashboard
app/tasks/_components/
  task-form.tsx                 Client: create/edit form (useActionState), field errors, pending state
  task-item.tsx                 Client: one task; complete/reopen toggle, inline edit, delete confirmation
lib/tasks/
  shared.ts                     Client-safe types and constants (filters, priorities, TaskView, form states)
  validation.ts                 Server-side input parsing (title, description, dueDate, priority, id)
  dates.ts                      Date-only helpers (parse, today in a time zone, add days)
  queries.ts                    server-only: listTasks, getTaskCounts, getToday, parseTaskFilter
```

- **Data flow:** Server Components read through `lib/tasks/queries.ts`, which calls `requireUser()` itself. Mutations go through the Server Actions, which call `refresh()` so the list updates in the same round trip. Nothing is cached (`use cache` is not used), so data is always fresh.
- **Data sent to the client:** only `TaskView`, which has `id`, `title`, `description`, `priority`, `dueDate` (YYYY-MM-DD), `completed` and `overdue`. Raw database rows are never sent.
- **"Today" and "overdue":** computed from the visitor's time zone. On Vercel this comes from the `x-vercel-ip-timezone` request header; locally it's the server's time zone; unknown zones fall back to UTC. A task is overdue if it's active and its due date is before today.
- **Sorting:**
  - **All, Active and Overdue:** open tasks first, then by soonest due date (no date last), then highest priority, then newest.
  - **Completed:** most recently updated first.
  - The list is capped at 500 tasks to guard against unbounded responses.

## Security

| Layer | Protection |
|---|---|
| `proxy.ts` | Added `/tasks/:path*` to the matcher, for the quick redirect to `/login` (not the security boundary) |
| Page | `TaskList` calls `requireUser()` before reading anything |
| Queries | `listTasks` and `getTaskCounts` call `requireUser()` themselves (the data-access-layer pattern) |
| Server Actions | Each action calls `requireUser()` **first**. Signed out or a different account → redirect to `/login`, and no database change |
| Input validation (server) | `title`: required, whitespace collapsed, at most 200 characters. `description`: optional, CRLF normalized to `\n`, at most 2000. `dueDate`: optional, strict `YYYY-MM-DD`, must be a real calendar date, year 2000–2100. `priority`: must be one of the 4 enum values (default MEDIUM). `id`: must be a UUID. Non-string values (such as file uploads) are rejected |
| Trusted fields only | Actions accept only `id` and the editable fields. `status`, `createdAt` and any ownership data in the request are ignored (tested). Complete/reopen accepts only `completed=true/false` |
| Errors | The user sees generic messages. The server log shows only `error.message` (no stack traces, no data). A missing task gives a "no longer exists" message and refreshes the list |
| Framework | Next.js Server Action protections (Origin/Host CSRF check, encrypted action IDs, 1 MB body limit) |
| No API routes | No new API endpoints were added; Server Actions cover every mutation. `/api/me` (existing) is unchanged |

## UI and UX (mobile-first, PWA)

- **Layout:**
  - Sticky top bar with a back button to the dashboard.
  - New-task card at the top, then horizontally scrollable filter pills with counts (the overdue count is red when above 0), then the task cards.
  - Single column, max width `2xl`, with bottom safe-area padding for Android gesture navigation.
- **Touch targets:** buttons at least 40–44 px. The complete/reopen control has a 44 px hit area around a 24 px circle. Inputs use 16 px text, so mobile browsers don't zoom into fields.
- **Task card:**
  - Title, description (up to 3 lines, line breaks kept), due chip (Today, Tomorrow, Yesterday, "Nov 5", or "Overdue · …" in red) and a priority badge (Low, Medium, High, Urgent).
  - Overdue tasks get a red border, and completed tasks are struck through.
- **Create and edit:** title, due date (native date picker), priority (native select) and description. Field errors appear inline (`aria-invalid` and `aria-describedby`). After an error the form keeps what you typed. The button shows "Saving…" while saving, and after creating a task the title field is focused again for quick entry.
- **Complete and reopen:** one tap. The checkmark changes immediately (optimistic) while the server confirms.
- **Delete:** an inline confirmation ("Delete this task? This can't be undone." with Cancel and Delete), with no browser dialog. The button shows "Deleting…" while working.
- **States:**
  - Loading: a skeleton (filter pills and three placeholder cards).
  - Empty: a separate message for each filter, for example "No tasks yet", "All caught up", "Nothing overdue".
  - Errors: inline for actions, and the error page with a Try again button for loading failures.
- **Dashboard:** the "Tasks" card is now a link showing "N active tasks · M overdue". If the database is unavailable, the card falls back to "Open your task list" instead of breaking the dashboard.
- **Dark mode:** supported on every new element.

## Files created or modified

| File | Change |
|---|---|
| `app/tasks/page.tsx`, `app/tasks/actions.ts`, `app/tasks/error.tsx` | New |
| `app/tasks/_components/task-form.tsx`, `task-item.tsx` | New |
| `lib/tasks/shared.ts`, `validation.ts`, `dates.ts`, `queries.ts` | New |
| `app/dashboard/page.tsx` | The Tasks placeholder card is replaced by a link card with live counts |
| `proxy.ts` | The matcher now includes `/tasks/:path*` |
| `lib/dal.ts` | Added `await connection()` before `auth()` in `getAuthorizedUser()`; see "Errors found and fixed" |

No changes to the Prisma schema, migrations, auth configuration (`auth.ts`), environment variables or dependencies.

## Database changes

**None.** No schema change and no migration. Neon had **0 tasks** before testing and **0 tasks** after. All test records used the title prefix `__claude_e2e__` and were deleted through the app's own delete action. A final cleanup step removed only rows with that prefix (0 were left over), and a snapshot of all other tasks was compared before and after (identical).

## Tests and validation

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Passed |
| `npm run lint` | ✅ Passed |
| `npm run build` | ✅ Passed; `/tasks` is a partial prerender (static shell with the list streamed) |
| Validation and date unit tests (temporary script, 31 cases) | ✅ 31/31. Covers empty, whitespace and too-long title; too-long description; invalid dates (`2026-02-30`, `abc`, `2026-13-01`, years out of range, wrong formats); a valid leap day; invalid and lowercase priority; file upload rejected; extra fields (`status`, `id`, `createdAt`) ignored; UUID checks including an SQL-injection-style string; time-zone "today" (Kyiv vs. New York across UTC midnight, invalid zone falls back to UTC); month rollover |
| End-to-end test against Neon (production build, real Server Actions over HTTP, locally signed sessions) | ✅ 31/31, see below |
| Recheck after the `lib/dal.ts` fix | ✅ 27/27: every route for signed out, owner and other account, plus create, complete, reopen and delete; server log clean |

**End-to-end scenarios (all passed):**
- **Authorization:**
  - Create, update, complete/reopen and delete while signed out or with a different Google account all redirect to `/login`, and nothing changes in the database.
  - `GET /tasks` while signed out or as a different account → 307 to `/login`.
- **Create:**
  - Validation messages for an empty title and an invalid date.
  - Valid creates store the fields correctly. An injected `status=DONE` is ignored (stored as TODO).
  - Default priority is MEDIUM, and the due date is stored as midnight UTC of the chosen day.
  - Description line breaks are stored as `\n`.
- **Update:**
  - Fields change, and the date and description can be cleared.
  - An invalid id is rejected; a non-existent id gives the "no longer exists" message and creates nothing.
- **Complete and reopen:** DONE and back to TODO. An invalid `completed` value is ignored.
- **Page:**
  - All three test tasks render, sorted overdue → upcoming → completed.
  - The active, completed and overdue filters show the correct subsets, and an unknown filter falls back to All.
  - The dashboard shows the Tasks link with active and overdue counts.
- **Delete:** a malformed id is rejected (`' OR 1=1 --`), and the owner deletes successfully.
- **Data safety:** non-test data unchanged (snapshot identical).

**Not tested:**
- Visual and touch testing in a real browser or the installed Android app. Verified through server-rendered HTML and actions only.
- Behavior on Vercel (the time-zone header comes from Vercel and couldn't be exercised locally).

## Errors found and fixed

1. **Description line endings:** multipart form submissions encode newlines as CRLF, so descriptions would have been stored with `\r\n`. Found by the end-to-end test; fixed in `validation.ts`, which now normalizes to `\n`. Retested.
2. **`crypto.getRandomValues()` error in the server log** (`Route "/tasks" … encountered the unstable value crypto.getRandomValues() while prerendering`).
   - **Cause:** Auth.js `auth()` generates a CSRF token with `crypto.getRandomValues()` on every call. With Cache Components and partial prefetching, Next.js reports this when it runs during prerendering.
   - **Scope:** this already affected `/login` and `/dashboard` since the authentication milestone. Responses were still correct, so earlier tests (which only scanned `[auth]` log lines) didn't catch it.
   - **Fix:** `getAuthorizedUser()` now calls `await connection()` before `auth()`, which marks the session check as request-time only. That's appropriate for authenticated data anyway.
   - **After the fix:** 0 such errors in the server log, and all auth checks behave the same.
3. **Test-only issues (not app bugs):**
   - `node-pg` reads `timestamp without time zone` as local time, which caused one false failure. The test now compares the raw SQL text.
   - One bash heredoc couldn't be parsed, so the test scripts were written as files instead.
   - One test helper didn't handle relative `Location` headers.

## Deployment

| Item | Result |
|---|---|
| Schema and migrations | ✅ Not required, checked before committing. `schema.prisma` matches the applied `20261101000000_init` SQL exactly. Live Neon vs. schema: "This is an empty migration". `prisma migrate status`: "Database schema is up to date!" No migration was run |
| Pre-commit checks | ✅ 15 files. No secrets (compared against the real local env values, never printed, plus a pattern scan). No `.env` files or temporary test scripts. `tsc`, lint and build passed |
| Commit | `5dd97fda86079b0d78c896a9f960c47256bfd47b` (`5dd97fd`), `feat: implement task manager` |
| Push | ✅ `c78c0a3..5dd97fd main -> main`, a fast-forward (no force push). Local `main` and `origin/main` are in sync |
| Vercel | ✅ `success`, "Deployment has completed" (2026-11-01T01:32:00Z UTC). Deployment page: https://vercel.com/123456789-aaa5/my-ai-assistant/NXmbngvSEzJ2eopn7jv5rCfugwAt |
| **Production URL** | **https://my-ai-assistant-eta-jet.vercel.app/tasks** |

**Production checks** (no sign-in, nothing modified):

| Check | Result |
|---|---|
| `/tasks` and `/tasks?filter=overdue` while signed out | ✅ 307 to `/login`. `/tasks` is deployed and the new proxy rule is active; before this deployment it would have returned 404 |
| `/tasks` with a forged session cookie | ✅ 307 to `/login` |
| `/`, `/dashboard` | ✅ 307 to `/login` |
| `/login`, `/manifest.webmanifest` | ✅ 200 |
| `/api/me` | ✅ 401 |
| Unknown route | ✅ 404 |
| Google OAuth callback URL | ✅ Unchanged (`https://my-ai-assistant-eta-jet.vercel.app/api/auth/callback/google`) |
| Signed-out `createTask` Server Action sent directly to production | ✅ 307 to `/login`. The Neon task count was 1 before and 1 after (read-only count), with no probe row created |

**Existing user data:** Neon contained **1 task** at deployment time, presumably created by the user. It was only counted (read-only), never read in detail, modified or deleted. No migrations were run.

**Not done by Claude:** a signed-in production test, which needs the owner's Google account. Use the checklist below.

## Errors / unresolved issues and limitations

- **No pagination:** the list is capped at 500 tasks, which is fine for personal use.
- **"Today" on Vercel** relies on Vercel's IP-based time zone. With a VPN, or near midnight while travelling, "overdue" may be off by a day. An explicit time-zone setting can be added later if needed.
- **Completing a task updates `updatedAt`,** which the Completed filter uses for sorting. Editing a completed task also moves it to the top of that list.
- **Offline:** the PWA still has no service worker, so tasks need a connection, as intended.
- The PWA deployment report updates are included in the same commit.

## Next steps / manual actions

1. ~~Approve the commit and deployment.~~ Done (approved by the user).
2. After deployment, test on Android (installed PWA) and desktop:
   - [ ] Dashboard → Tasks card → `/tasks`; the back button returns to the dashboard.
   - [ ] Create a task with only a title, then one with a description, a due date in the past, and priority Urgent.
   - [ ] Check the filters: Active, Completed, Overdue (the past-due task appears with a red "Overdue" chip).
   - [ ] Complete a task (instant checkmark), then reopen it.
   - [ ] Edit a task, change and clear the due date, then save.
   - [ ] Try to save an empty title. You should see an inline error, and your other input should be kept.
   - [ ] Delete a task: Delete → confirm. Cancel should keep the task.
   - [ ] Check the dashboard counts ("N active tasks · M overdue").
