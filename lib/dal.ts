import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, isAllowedEmail } from "@/auth";

export type AuthorizedUser = {
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * Returns the signed-in owner, or null. The allowlist is re-checked on every call,
 * so changing ALLOWED_GOOGLE_EMAIL immediately locks out existing sessions.
 * Use in Route Handlers (respond with 401 when null).
 */
export const getAuthorizedUser = cache(async (): Promise<AuthorizedUser | null> => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) return null;

  return {
    email,
    name: session.user?.name ?? null,
    image: session.user?.image ?? null,
  };
});

/**
 * Returns the signed-in owner or redirects to the login page.
 * Use in Server Components and Server Actions.
 */
export async function requireUser(): Promise<AuthorizedUser> {
  const user = await getAuthorizedUser();
  if (!user) redirect("/login");
  return user;
}
