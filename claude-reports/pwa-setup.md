# PWA Setup: Installable App (Manifest and Icons)

**Date:** 2026-11-01
**Status:** ✅ Implemented, verified locally and approved by the user. Committed in `feat: add installable PWA support`; see "Deployment" below for the production result.

## Summary

- Made My AI Assistant installable as a Progressive Web App (PWA) with a web app manifest, original app icons (including maskable icons) and install-related metadata.
- **No service worker was added.**
  - Chrome on Android and desktop doesn't require one to install a site, only a valid manifest served over HTTPS. This matches the Next.js 16 PWA guide.
  - Without a service worker, nothing can be cached by one: no authenticated pages, private API responses, OAuth routes or user data.
  - Offline support and push notifications are planned for later.
- **No new dependencies.** Icons were rendered once from SVG sources using `sharp`, which Next.js already installs, in a throwaway script that is not part of the project.
- Authentication, cookies, redirects, protected routes, `proxy.ts` and the database are **unchanged**.

## Files created or modified

| File | Change |
|---|---|
| `app/manifest.ts` | New. Served at `/manifest.webmanifest`; Next.js adds `<link rel="manifest">` automatically |
| `app/layout.tsx` | Added `applicationName` and `appleWebApp` (title "Assistant", for iOS home-screen support). The existing viewport and `theme-color` (light `#fafafa` / dark `#09090b`) were kept |
| `public/icons/icon.svg` | New. Source design: rounded dark square with a white sparkle (✦), matching the app's UI mark |
| `public/icons/icon-maskable.svg` | New. Source for the maskable version: full-bleed background, sparkle scaled to 72% to stay inside the safe zone |
| `public/icons/icon-192.png`, `icon-512.png` | New. `purpose: any` |
| `public/icons/icon-maskable-192.png`, `icon-maskable-512.png` | New. `purpose: maskable`; checked visually with a circular mask and the 80% safe-zone circle |
| `app/apple-icon.png` | New, 180×180. Next.js generates `<link rel="apple-touch-icon">` |
| `app/favicon.ico` | **Replaced** the default Next.js favicon with the new mark (16, 32 and 48 px) |

### Manifest

| Field | Value |
|---|---|
| `id` | `/` |
| `name` | My AI Assistant |
| `short_name` | Assistant |
| `start_url` | `/` (the proxy sends signed-in users to `/dashboard` and others to `/login`) |
| `scope` | `/` |
| `display` | `standalone` |
| `theme_color` | `#fafafa` (matches the light theme color; pages also set a dark `theme-color` via media query) |
| `background_color` | `#fafafa` (splash screen) |
| `icons` | 192 and 512 (`any`), 192 and 512 (`maskable`) |
| Also set | `description`, `lang: en`, `categories: ["productivity"]` |

## Database changes

None.

## Tests and validation

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Passed |
| `npm run lint` | ✅ Passed |
| `npm run build` | ✅ Passed. `/manifest.webmanifest` and `/apple-icon.png` are prerendered as static files |

**Runtime test** on a production build (`next start` on port 3100, test-only auth values, locally signed sessions):

| Check | Result |
|---|---|
| Public access without cookies | ✅ Each of these returns 200 with no redirect: `/manifest.webmanifest` (`application/manifest+json`), the four `/icons/*.png` files, `/icons/icon.svg`, `/apple-icon.png` and `/favicon.ico` |
| Manifest content | ✅ Valid JSON with all the fields above |
| Icon sizes | ✅ Each manifest icon's real pixel size matches its declared `sizes` |
| `<head>` tags on `/login` | ✅ `manifest`, `icon`, `apple-touch-icon`, `theme-color` (light and dark), `application-name`, `mobile-web-app-capable`, `apple-mobile-web-app-title` and `viewport` are present |
| Service worker | ✅ None registered or served |
| Auth, signed out | ✅ `/` and `/dashboard` 307 to `/login`; `/login` 200; `/api/me` 401 |
| Auth, owner session | ✅ `/` and `/login` 307 to `/dashboard`; `/dashboard` 200; `/api/me` 200 |
| Auth, valid session for a different email | ✅ Same as signed out (redirect to login, 401) |
| Google sign-in redirect | ✅ 302 to `accounts.google.com` (unchanged) |

**Not tested:**
- Actual installation on an Android device (needs the HTTPS production deployment).
- Lighthouse and Chrome DevTools install checks.

## Android installation steps (after deployment)

1. Open https://my-ai-assistant-eta-jet.vercel.app in **Chrome** on Android and sign in.
2. Tap the **⋮** menu, then **Add to Home screen**, then **Install**. Chrome may also show an "Install app" banner by itself.
3. The **Assistant** icon appears on the home screen and in the app drawer. It opens without the browser address bar.
4. **Desktop (Chrome or Edge):** use the install icon at the right of the address bar, or ⋮, then **Cast, save and share**, then **Install page as app**.

**What to check after installing:**
- The icon looks right in your launcher's shape.
- The splash screen is light with the icon.
- The app opens on the dashboard if you're signed in, or the login page if not.
- Google sign-in works inside the installed app (it may briefly show Google in an in-app browser sheet, then return).
- "Sign out" works.

## Errors / unresolved issues and limitations

- **No offline support.** Without a service worker and network, the installed app shows Chrome's offline page. This is intended for now.
- **Session sharing on Android:** the installed app uses the same cookies as Chrome on that phone. Signing in or out in one also applies to the other.
- **Google sign-in in standalone mode:** `accounts.google.com` is outside the app's scope, so Android shows it in an in-app browser sheet and then returns to the app. This is expected PWA behavior.
- **iOS:** the `apple-touch-icon` and `appleWebApp` metadata are in place, but iOS installation (Safari → Share → Add to Home Screen) has not been tested.
- **Updating icons:** edit the SVGs in `public/icons/` and regenerate the PNGs, the `favicon.ico` and `app/apple-icon.png`. Any SVG-to-PNG tool works; this time `sharp` was used. The manifest paths stay the same, so nothing else needs to change. Android may cache an installed app's icon for a while.
- The pending authentication deployment report updates are included in the same commit.

## Next steps / manual actions

1. ~~Approve the commit, push and deployment.~~ Done (approved by the user).
2. After deployment, install the app on Android and check the items above.
3. Later milestone: add a service worker for offline support and push notifications. It should cache only public static assets and never cache `/dashboard`, `/api/*` or `/api/auth/*`.
