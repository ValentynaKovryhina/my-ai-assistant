import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const DAY_IN_SECONDS = 24 * 60 * 60;

/**
 * Single-user allowlist. Fails closed: if ALLOWED_GOOGLE_EMAIL is not set, nobody is allowed.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_GOOGLE_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

// Client ID, client secret and AUTH_SECRET are read from AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and AUTH_SECRET.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Always show the account chooser, so another account can be picked after a rejected attempt.
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  // Stateless, encrypted JWT in an HTTP-only cookie: no database tables needed for a single user.
  session: {
    strategy: "jwt",
    maxAge: 30 * DAY_IN_SECONDS,
    updateAge: DAY_IN_SECONDS,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ account, profile }) {
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        isAllowedEmail(profile.email)
      );
    },
  },
});
