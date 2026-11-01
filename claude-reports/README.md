# Claude Reports

Development reports written by Claude Code after each task. A task that continues later updates its existing report.

| Report | Topic | Last updated | Status |
|---|---|---|---|
| [database-setup.md](database-setup.md) | PostgreSQL (Neon) + Prisma 7 setup, `Task` model, initial migration | 2026-11-01 | ✅ Complete locally: migration applied and verified on Neon; committed in database-deployment |
| [database-deployment.md](database-deployment.md) | Commit and push of the database setup to `origin/main`, Vercel deployment check | 2026-11-01 | ✅ Pushed (`f1d2eef`); Vercel deployment succeeded; `DATABASE_URL` in Vercel confirmed by the user |
| [authentication-setup.md](authentication-setup.md) | Google sign-in with Auth.js v5: single-user allowlist, JWT sessions, login page, protected dashboard | 2026-11-01 | ✅ Complete: local Google sign-in works; Vercel env vars confirmed by the user |
| [authentication-deployment.md](authentication-deployment.md) | Commit and push of Google authentication, Vercel deployment check, production test checklist | 2026-11-01 | ✅ Pushed (`ba523de`); Vercel deployment succeeded; live smoke test passed |
| [pwa-setup.md](pwa-setup.md) | Installable PWA: web app manifest, original icons (incl. maskable), install metadata; no service worker | 2026-11-01 | ✅ Pushed (`c78c0a3`); Vercel deployment succeeded; manifest and icons verified over HTTPS |
| [task-manager.md](task-manager.md) | Task Manager module: /tasks page, CRUD Server Actions, filters, validation, no migration | 2026-11-01 | ✅ Pushed (`5dd97fd`); Vercel deployment succeeded; /tasks protected in production |
| [task-manager-v2.md](task-manager-v2.md) | Task Manager v2: recurrence (calendar / window / after-completion), tracking modes, activity journal, analytics, quick finder, categories | 2026-11-02 | ✅ Pushed (`9b49756`); Vercel deployment succeeded; migration applied to Neon; production auth checks passed |
| [weight-tracker.md](weight-tracker.md) | Weight Tracker: measurements, settings (height, goal), BMI, two charts | 2026-11-02 | 🟡 Implemented and tested (86 unit, 21 Neon integration, 4 isolated-local, 21 + 60 HTTP checks); migration applied to Neon; not committed or deployed; waiting for review |
