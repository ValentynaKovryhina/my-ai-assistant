# Database Setup: PostgreSQL + Prisma

**Date:** 2026-11-01 (sessions 1–3)
**Status:** ✅ Complete locally. Neon is connected, the initial migration is applied and verified, and the CRUD test passed. Committed and pushed; see [database-deployment.md](database-deployment.md).

## Summary

- Prepared the Next.js project to use the Neon PostgreSQL database through Prisma ORM.
- Pinned Prisma to stable **7.10.1**. The npm `latest` tag for `prisma` points to the pre-release `8.0.0-rc.29`, which was avoided.
- Used the Prisma 7 conventions:
  - `prisma-client` generator with output to `generated/prisma`
  - connection URL in `prisma7.config.ts` (the default config filename in this version)
  - driver adapter `@prisma/adapter-pg` at runtime
- Created a `Task` model with `TaskStatus` and `TaskPriority` enums.
- Generated the initial migration SQL offline using `prisma migrate diff`. No database connection was made.

## Files created or modified

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Added the dependencies below and new scripts |
| `prisma/schema.prisma` | New: PostgreSQL datasource, `Task` model, enums |
| `prisma7.config.ts` | New, from `prisma init`: schema path, migrations path, `DATABASE_URL` from env (loaded with `dotenv/config`) |
| `prisma/migrations/20261101000000_init/migration.sql` | New: initial migration |
| `prisma/migrations/migration_lock.toml` | New: provider lock (`postgresql`) |
| `lib/prisma.ts` | New: shared `PrismaClient` using `PrismaPg`; throws an error if `DATABASE_URL` is missing |
| `.env.example` | New: placeholder `DATABASE_URL` |
| `.gitignore` | Added `!.env.example`; `prisma init` added `/generated/prisma` |
| `.env` | New, from `prisma init`. Git-ignored. The user replaced the placeholder with the real Neon `DATABASE_URL` in session 3 |

**Dependencies added:**
- Regular: `@prisma/client`, `@prisma/adapter-pg`, `pg`
- Dev: `prisma`, `dotenv`, `@types/pg`

**npm scripts added:**
- `postinstall`: runs `prisma generate` (needed on Vercel because `generated/` is not committed)
- `db:generate`
- `db:validate`
- `db:migrate:dev`
- `db:migrate:deploy`
- `db:migrate:status`

## Database changes

Migration `20261101000000_init` was **applied to Neon in session 3** (database `neondb`, schema `public`) with `prisma migrate deploy`. It:

- Created the enums:
  - `TaskStatus` (TODO, IN_PROGRESS, DONE, CANCELLED)
  - `TaskPriority` (LOW, MEDIUM, HIGH, URGENT)
- Created the table `tasks` with columns:
  - `id` (UUID)
  - `title`
  - `description` (nullable)
  - `status` (default TODO)
  - `priority` (default MEDIUM)
  - `due_date` (nullable)
  - `created_at`
  - `updated_at`
- Created indexes on `status` and `due_date`.

The migration only adds objects. Nothing is dropped.

## Tests and validation

| Check | Result |
|---|---|
| `prisma validate` | Passed |
| `prisma format --check` | Passed |
| `prisma generate` without `DATABASE_URL` (simulates the Vercel build) | Passed |
| `tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git add -A --dry-run` | Only the intended files listed. `.env`, `.env.local` and `generated/` are ignored |

There are no automated tests in the project yet.

## Session 2 (2026-11-01): connection, migration and security checks

**Status (at the time):** Blocked. `.env` still contained the `prisma init` placeholder (user `johndoe`, host `localhost:5432`). I stopped before any database operation.

| Step | Result |
|---|---|
| 1. Real `DATABASE_URL` in `.env`? | **No, placeholder only.** There was no `.env.local` |
| 2. Ask the user to configure the connection | Done; see the manual actions below |
| 3. Connectivity to Neon | Not run (blocked); done in session 3 |
| 4. Migration matches the schema | **Passed.** SQL generated fresh from `schema.prisma` is identical to `20261101000000_init/migration.sql` |
| 5. Migration status / apply | Not run (blocked); done in session 3 |
| 6. Check that the table, enums and indexes exist | Not run (blocked); done in session 3 |
| 7. Read/write test with a temporary task | Not run (blocked); done in session 3 |
| 8. `npm audit` | Done; see below |
| 9. Credentials not tracked by Git | **Passed.** `git ls-files` shows no `.env*`, `.pem` or secret files; `.env`, `.env.local` and `.env.production` are ignored. Nothing has been committed |

### npm audit findings

There are **16 moderate** findings and no low, high or critical ones. `npm audit --omit=dev` reports **0 vulnerabilities**, so they don't affect the production app on Vercel.

- **Root cause:** one advisory in `minimatch` 3.1.5, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), a denial of service through crafted glob patterns.
- **Where it comes from:** `minimatch` is pulled in only by the ESLint toolchain (`eslint`, `eslint-config-next`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`).
- **Real risk:** low. It only runs locally and in CI, on the project's own lint config, not on input from users.
- **Why it wasn't fixed:** `npm audit fix --force` would *downgrade* to `eslint@4.0.0` and `eslint-config-next@0.2.4`, which would break the project.
- **Recommendation:** wait for upstream releases of ESLint and `eslint-config-next` that drop `minimatch` 3.x. A targeted `overrides` entry is possible but risky, because `minimatch` 10 has a different API. Recheck when upgrading Next.js or ESLint.


## Session 3 (2026-11-01): Neon connection, migration and verification

**Status:** ✅ All steps passed. Credentials were masked in all terminal output and do not appear in this report.

| Step | Result |
|---|---|
| 1. Connection | ✅ Connected to Neon. Database `neondb`, PostgreSQL 18.6. The URL uses the **pooled** endpoint (`-pooler`) with `sslmode=require&channel_binding=require` |
| 2. Migration status (before) | 1 migration found; `20261101000000_init` **not yet applied**. The `public` schema had **0 tables**, so there was no existing data |
| 3. Apply | ✅ `prisma migrate deploy` (applies pending migrations only; never resets). Result: "All migrations have been successfully applied." Status afterwards: "Database schema is up to date!" |
| 4. Database check | ✅ See below |
| 5. CRUD test | ✅ See below |
| 6. Existing data | ✅ Nothing was modified or deleted. The row count was 0 before and 0 after; only the test record was touched, by its `id` |
| 7. Prisma config vs. installed version | ✅ `prisma` and `@prisma/client` 7.10.1, `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1. The CLI loads `prisma7.config.ts`; the runtime client (`lib/prisma.ts` + `PrismaPg`) connects and runs queries |
| 8. Validation and build | ✅ See below |

### Database check (from the PostgreSQL catalog)

- **Tables:** `tasks` and `_prisma_migrations`.
- **`tasks` columns:**

  | Column | Type | Nullable | Default |
  |---|---|---|---|
  | `id` | uuid | no | none |
  | `title` | text | no | none |
  | `description` | text | yes | none |
  | `status` | `TaskStatus` | no | `'TODO'` |
  | `priority` | `TaskPriority` | no | `'MEDIUM'` |
  | `due_date` | timestamp | yes | none |
  | `created_at` | timestamp | no | `CURRENT_TIMESTAMP` |
  | `updated_at` | timestamp | no | none |

- **Enums:**
  - `TaskStatus` (TODO, IN_PROGRESS, DONE, CANCELLED)
  - `TaskPriority` (LOW, MEDIUM, HIGH, URGENT)
- **Indexes:**
  - `tasks_pkey` (unique, on `id`)
  - `tasks_status_idx`
  - `tasks_due_date_idx`
- **`_prisma_migrations`:** `20261101000000_init` is finished, has no rollback, and has 1 step applied.
- **Drift check:** `prisma migrate diff --from-config-datasource --to-schema` returned "This is an empty migration", so the live database matches `schema.prisma` exactly.

### CRUD test

I ran a temporary script through the app's own `lib/prisma.ts`. The script was deleted afterwards and is not part of the project.

| Operation | Result |
|---|---|
| Create | ✅ Task created with a UUID; the defaults `status=TODO` and `createdAt` were applied |
| Read | ✅ `findUnique` by `id` returned the record |
| Update | ✅ `status` changed to `DONE`; `updatedAt` advanced automatically |
| Delete | ✅ Deleted by `id`; a follow-up read returned `null` |

The row count was 0 before and 0 after, so the table is unchanged. The first attempt failed before reaching the database: `package.json` has no `"type": "module"`, so the `.ts` file was compiled as CommonJS, which doesn't allow top-level `await`. Renaming the temporary file to `.mts` fixed it. No project files were changed.

### Validation and build

| Check | Result |
|---|---|
| `prisma validate` | ✅ Passed |
| `prisma format --check` | ✅ Passed |
| `prisma generate` | ✅ Passed (Prisma Client 7.10.1) |
| `tsc --noEmit` | ✅ Passed |
| `npm run lint` | ✅ Passed |
| `npm run build` | ✅ Passed |
| Git | ✅ No `.env*` files tracked. All changes are uncommitted |

## Errors / unresolved issues

- **`pg` SSL warning (not an error):**
  - `pg` 8.x treats `sslmode=require` as `verify-full`. In `pg` 9 this changes to the weaker libpq behavior.
  - Today's behavior is already the secure one.
  - To keep it after future upgrades, change `sslmode=require` to `sslmode=verify-full` in `.env` (and later in Vercel).
  - I did not edit `.env`; that's the user's choice.
- **Migrations go through the pooled endpoint:** `migrate deploy` worked through the pooled endpoint. If a later migration fails with lock or prepared-statement errors, run migration commands with Neon's direct (non-pooled) connection string.
- **`npm audit`:** 16 moderate findings, all in dev-only ESLint tooling and not fixed; see session 2.

## Next steps / manual actions

1. **Vercel:** add `DATABASE_URL` under Project → Settings → Environment Variables, for Production (and Preview if wanted). The build runs `prisma generate` through `postinstall`.
2. **Production migrations:** migrations are not run automatically during the Vercel build. They're applied to Neon manually with `npm run db:migrate:deploy`. The current Neon database is already up to date. Decide whether Preview deployments should use a separate Neon branch.
3. **Optional:** create `.env.local` with the same `DATABASE_URL` if you prefer Next.js-specific env files. Next.js also reads `.env`.
4. **Optional:** switch `sslmode=require` to `sslmode=verify-full`; see above.
5. **Commit** when ready. Nothing has been committed, pushed or deployed.
6. **Future schema changes:** edit `schema.prisma`, run `npm run db:migrate:dev -- --name <change>` against a development Neon branch, review the generated SQL, then run `db:migrate:deploy` on production.
