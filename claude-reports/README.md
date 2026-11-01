# Claude Reports

Development reports written by Claude Code after each task. A task that continues later updates its existing report.

| Report | Topic | Last updated | Status |
|---|---|---|---|
| [database-setup.md](database-setup.md) | PostgreSQL (Neon) + Prisma 7 setup, `Task` model, initial migration | 2026-11-01 | ✅ Complete locally: migration applied and verified on Neon; committed in database-deployment |
| [database-deployment.md](database-deployment.md) | Commit and push of the database setup to `origin/main`, Vercel deployment check | 2026-11-01 | ✅ Pushed (`f1d2eef`); Vercel deployment succeeded; `DATABASE_URL` in Vercel confirmed by the user |
| [authentication-setup.md](authentication-setup.md) | Google sign-in with Auth.js v5: single-user allowlist, JWT sessions, login page, protected dashboard | 2026-11-01 | ✅ Complete: local Google sign-in works; Vercel env vars confirmed by the user |
| [authentication-deployment.md](authentication-deployment.md) | Commit and push of Google authentication, Vercel deployment check, production test checklist | 2026-11-01 | See report |
