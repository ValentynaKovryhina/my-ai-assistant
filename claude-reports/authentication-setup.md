# Authentication Setup: Google Sign-In (Auth.js)

**Date:** 2026-11-01
**Status:** ✅ Complete. Google sign-in works on localhost with the owner's account (confirmed by the user), and the Vercel Production environment variables are confirmed by the user. Committed in `feat: implement secure Google authentication`; deployment results are in [authentication-deployment.md](authentication-deployment.md).

## 1. What was implemented

- **Library:** Auth.js / NextAuth **v5**, `next-auth@5.0.0-beta.32` (pinned exactly).
  - Its supported range includes Next 16 (`^16.0.0`).
  - It's the line Auth.js documents for the App Router.
  - v4 (`4.24.15`) is the stable npm `latest`, but it's built around the older Pages Router.
  - Both lines were released on 2026-07-20, so both are maintained.
  - v5 is still labeled *beta*. That's why it's pinned exactly; upgrade on purpose, not automatically.
- **Google sign-in only:**
  - The Google OIDC provider uses PKCE, state and nonce checks.
  - `prompt=select_account` makes Android and desktop always show the account chooser.
  - There is no GitHub login and no password system.
- **Single-user allowlist:**
  - Sign-in is allowed only if the provider is `google`, `email_verified === true`, and the email matches `ALLOWED_GOOGLE_EMAIL`.
  - The comparison ignores case and surrounding spaces.
  - **Fails closed:** if `ALLOWED_GOOGLE_EMAIL` is unset, nobody can sign in. No email is hardcoded.
- **Server-side authorization** (`lib/dal.ts`):
  - `getAuthorizedUser()` returns the user or null, for Route Handlers.
  - `requireUser()` returns the user or redirects to `/login`, for pages and Server Actions.
  - Both re-check the allowlist on every request. Changing `ALLOWED_GOOGLE_EMAIL` locks out existing sessions immediately.
- **`proxy.ts`** (Next 16's replacement for `middleware.ts`):
  - Does quick redirects based on the session cookie, with no database access.
  - Renews the session cookie while the app is in use.
  - Runs only on `/`, `/login` and `/dashboard/*`, so static files and a future PWA manifest or service worker stay out of it.
  - It is **not** the security boundary; every page, action and API route checks for itself.
- **Session strategy:** encrypted JWT in an HTTP-only cookie, with `maxAge` of 30 days and `updateAge` of 24 hours.
  - The session lasts 30 days from the last activity, and the cookie is reissued at most about once a day.
  - Without use, it expires after 30 days.
- **Pages:**
  - `/login`: a card with "Continue with Google" and error messages. Signed-in users are redirected to `/dashboard`.
  - `/dashboard`: a protected placeholder with a greeting, the signed-in email, a "Sign out" button, and "Tasks" and "Assistant" cards marked "Coming soon".
  - `/`: redirects to `/dashboard` or `/login`.
- **Example private API:** `GET /api/me` returns 401 unless the owner is signed in. Use it as the pattern for future private routes.
- **Server Actions:** `signInWithGoogle` and `signOutAction` in `app/actions/auth.ts`. Future actions must call `requireUser()` first.
- **Mobile, Android and PWA readiness:**
  - Viewport with `viewport-fit=cover` and light/dark `themeColor`.
  - 48px tap target on the sign-in button and responsive layouts.
  - Dark mode, and `robots: noindex`.
- **Cache Components:** `cacheComponents: true` is enabled. All session reads are inside `<Suspense>`, so pages keep a static shell and the build passes.

### Why JWT sessions and not database sessions

- With a single user, a database adapter would add 4 tables (`User`, `Account`, `Session`, `VerificationToken`), a migration, and a database query on every request, with little benefit.
- The JWT is encrypted (JWE) with `AUTH_SECRET`, HTTP-only, `SameSite=Lax`, and on HTTPS uses a `__Secure-` prefix and the `Secure` flag.
- Ways to revoke a session:
  - change `ALLOWED_GOOGLE_EMAIL`, which the server checks on every request, or
  - rotate `AUTH_SECRET`, which invalidates all sessions.
- A database adapter can still be added later if multiple users or per-device session lists are ever needed.

## Files created or modified

| File | Change |
|---|---|
| `auth.ts` | New: Auth.js config (Google provider, allowlist sign-in callback, JWT session settings, custom pages) |
| `lib/dal.ts` | New: `getAuthorizedUser()` and `requireUser()`, marked `server-only` |
| `proxy.ts` | New: quick redirects and session renewal |
| `app/api/auth/[...nextauth]/route.ts` | New: Auth.js route handlers |
| `app/api/me/route.ts` | New: example protected API |
| `app/actions/auth.ts` | New: sign-in and sign-out Server Actions |
| `app/login/page.tsx` | New: login page |
| `app/dashboard/page.tsx` | New: protected dashboard placeholder |
| `app/page.tsx` | Replaced the starter page with the redirect |
| `app/layout.tsx` | Title "My AI Assistant", viewport, theme color, noindex |
| `.env.example` | Added `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_GOOGLE_EMAIL` placeholders |
| `.env.local` | New, git-ignored (not committed). Contains the locally generated `AUTH_SECRET` and the Google and allowlist values filled in by the user (never printed) |
| `package.json`, `package-lock.json` | Added `next-auth@5.0.0-beta.32` (exact) and `server-only` |

`.env` (with `DATABASE_URL`) was not changed. The earlier uncommitted report updates (`README.md`, `database-deployment.md`) were kept.

## Database changes

None. There are no new tables or migrations, and Neon was not touched. The existing Prisma setup is unchanged.

## 2. What was successfully tested

**Static checks:** `next typegen`, `tsc --noEmit`, `npm run lint` and `npm run build` all passed. Build output:
- `/`, `/login` and `/dashboard`: partial prerender (static shell with streamed parts)
- `/api/auth/[...nextauth]` and `/api/me`: dynamic
- the proxy is active

**Runtime tests** ran on `next start` (production build, port 3100) with throwaway test values set only for that process. The allowed email was `owner@example.test`. Sessions were signed locally with Auth.js's own `encode()`.

| Scenario | Result |
|---|---|
| Signed out: `/` and `/dashboard` | ✅ 307 to `/login` |
| Signed out: `/login` | ✅ 200, "Continue with Google" |
| Signed out: `/api/me` | ✅ 401 `{"error":"Unauthorized"}` |
| `/login?error=AccessDenied` | ✅ Shows "This Google account is not authorized…" |
| `/login?error=<unknown>` | ✅ Shows "Sign-in failed. Please try again." |
| `/api/auth/providers` | ✅ Callback is `http://localhost:3100/api/auth/callback/google` |
| Sign-in request | ✅ 302 to `accounts.google.com` with `prompt=select_account`, scopes `openid profile email`, PKCE S256 |
| Auth cookies | ✅ `HttpOnly; SameSite=Lax; Path=/` |
| Allowed owner session: `/` and `/login` | ✅ 307 to `/dashboard` |
| Allowed owner session: `/dashboard` | ✅ 200 with "Signed in as owner@example.test" and "Sign out". Session cookie renewed with `Expires` 30 days ahead, `HttpOnly` |
| Allowed owner session: `/api/me` | ✅ 200 with the owner's email and name |
| Valid session for a **different** email | ✅ `/dashboard` 307 to `/login`; `/api/me` 401 (server-side re-check works even though the session itself is valid) |
| Expired session | ✅ `/dashboard` 307 to `/login`; `/api/me` 401 |
| Forged cookie | ✅ 307 to `/login` (logged as `JWTSessionError`) |
| Sign out | ✅ The session cookie is cleared (`Max-Age=0`) |

**Notes from testing:**
- **Trusted host:** the first run returned `UntrustedHost` errors.
  - With `next start` (`NODE_ENV=production`), Auth.js only trusts the request host on Vercel (where it detects `VERCEL=1`), under `next dev`, or with `AUTH_TRUST_HOST`.
  - I reran with `AUTH_TRUST_HOST=true` for the local test only. No code change was needed, and `npm run dev` is not affected.
- **Not tested:**
  - a real Google sign-in, which needs the credentials below;
  - the `Secure`/`__Secure-` cookie on HTTPS, which comes from the library and can only be checked on Vercel;
  - visual checks on a real Android device.

## 3. Configuration (completed)

### Google Cloud (configured by the user)

- **Google Auth Platform:**
  - Audience: External, publishing status **Testing**, with the owner as test user.
  - Scopes: `openid`, `email`, `profile` only.
- **OAuth client:** a Web application with these authorized redirect URIs:
  - `http://localhost:3000/api/auth/callback/google`
  - `https://my-ai-assistant-eta-jet.vercel.app/api/auth/callback/google`
- **If you add a custom domain later**, also add `https://<domain>/api/auth/callback/google`.
- **Vercel preview deployments** (random `*.vercel.app` URLs) can't use Google sign-in, because Google needs exact redirect URIs.

### 4. Environment variables

| Variable | Local | Vercel Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ `.env` | ✅ Set (confirmed by the user) | Unchanged |
| `AUTH_SECRET` | ✅ `.env.local` | ✅ Set (confirmed by the user) | Separate value per environment. Rotating it signs you out everywhere |
| `AUTH_GOOGLE_ID` | ✅ `.env.local` | ✅ Set (confirmed by the user) | Read automatically by Auth.js v5. Names like `GOOGLE_CLIENT_ID` are **not** read |
| `AUTH_GOOGLE_SECRET` | ✅ `.env.local` | ✅ Set (confirmed by the user) | |
| `ALLOWED_GOOGLE_EMAIL` | ✅ `.env.local` | ✅ Set (confirmed by the user) | If empty, nobody can sign in |
| `AUTH_URL` / `AUTH_TRUST_HOST` | Not needed | Not needed | Vercel is detected automatically. Only needed for local `next start` testing |

## Troubleshooting history

- **Google "Error 400: invalid_request, Missing required parameter: client_id"** (2026-11-01).
  - **Cause:** `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` were still empty in `.env.local`. Not a code bug; reproduced with Auth.js directly.
  - **Fix:** the user created the OAuth client and filled in `.env.local`, then restarted `npm run dev`.
  - **Values check:** all set, with the expected format and no whitespace. They were never printed.
- **Other Google errors to know about:**
  - `redirect_uri_mismatch`: the URI in the client doesn't match exactly. Locally, use `http://localhost:3000` with no trailing slash.
  - "Access blocked": the account isn't a test user.

## Local Google sign-in test (2026-11-01)

| Item | Result |
|---|---|
| Live Google sign-in on `http://localhost:3000` with the owner's personal account | ✅ **Works**, as reported by the user |
| Google OAuth client redirect URIs (user-configured) | `http://localhost:3000/api/auth/callback/google` and `https://my-ai-assistant-eta-jet.vercel.app/api/auth/callback/google` |

**Server-side protection** was re-checked on a production build (`next start` on port 3100, test-only values, locally signed session tokens):

| Session | `/dashboard` | `/api/me` |
|---|---|---|
| Signed out | 307 to `/login` | 401 |
| Owner (allowed email) | 200 | 200 |
| Valid session, **different email** | 307 to `/login` | 401 |
| Expired owner session | 307 to `/login` | 401 |
| Forged cookie | 307 to `/login` | 401 |

**Not tested live by Claude:**
- Sign-in with a second, unauthorized Google account. The server-side rejection is covered by the table above. Google's Testing mode also blocks accounts that aren't test users.
- The production HTTPS cookie flags. Check them after deployment.

## Production readiness (2026-11-01)

| Check | Result |
|---|---|
| Changes limited to the authentication feature and its reports | ✅ |
| Secrets in commit files | ✅ None. All 15 files were compared against the actual local `.env` and `.env.local` values (without printing them), plus a pattern scan for Google client IDs and secrets and Neon strings. `.env` and `.env.local` are ignored |
| `tsc --noEmit` | ✅ Passed |
| `npm run lint` | ✅ Passed |
| `npm run build` | ✅ Passed (`/`, `/login`, `/dashboard` partial prerender; auth and `/api/me` dynamic; proxy active) |
| Production domain vs. OAuth callback | ✅ `https://my-ai-assistant-eta-jet.vercel.app` (the GitHub repository's homepage) returns 200 from Vercel. The configured callback `https://my-ai-assistant-eta-jet.vercel.app/api/auth/callback/google` matches the app's route `/api/auth/callback/google` exactly |
| Vercel Production environment variables (`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_GOOGLE_EMAIL`, `DATABASE_URL`) | ✅ Confirmed by the user (Claude has no Vercel access from this machine) |
| `AUTH_URL` / `AUTH_TRUST_HOST` in Vercel | Not needed. Auth.js detects Vercel (`VERCEL=1`) |

## Errors / unresolved issues

- `next-auth` v5 is a pre-release (`beta.32`). It's pinned exactly; check the release notes before upgrading.
- `npm install` reports the same dev-only ESLint `npm audit` findings as before (see database-setup.md). No new issues were investigated.

## 5. Next steps

- Deployment and the production test checklist are in [authentication-deployment.md](authentication-deployment.md).
