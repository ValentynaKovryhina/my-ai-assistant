import { NextResponse } from "next/server";
import { auth, isAllowedEmail } from "@/auth";

// Optimistic redirects only (reads the session cookie, no database access).
// Real authorization happens server-side via lib/dal.ts in every page, Server Action and Route Handler.
// Running auth() here also renews the session cookie as the user keeps using the app.
export default auth((req) => {
  const isAuthorized = isAllowedEmail(req.auth?.user?.email);
  const { pathname } = req.nextUrl;

  if (pathname === "/login") {
    return isAuthorized
      ? NextResponse.redirect(new URL("/dashboard", req.nextUrl))
      : NextResponse.next();
  }

  if (!isAuthorized) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

// Explicit list keeps static assets (and a future PWA manifest/service worker) out of the proxy.
export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
