import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/actions/auth";
import { getAuthorizedUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Sign in",
};

// Error codes Auth.js appends to the error page URL (?error=...).
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "This Google account is not authorized to use this assistant. Please sign in with the owner's account.",
  Configuration:
    "Sign-in is not configured correctly on the server. Please check the authentication settings.",
};
const DEFAULT_ERROR_MESSAGE = "Sign-in failed. Please try again.";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl text-white dark:bg-zinc-100 dark:text-zinc-900">
            ✦
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            My AI Assistant
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to continue to your personal assistant.
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginStatus searchParams={searchParams} />
        </Suspense>

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-5 text-base font-medium text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-100"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}

async function LoginStatus({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  // proxy.ts normally redirects signed-in users; this is the server-side fallback.
  if (await getAuthorizedUser()) redirect("/dashboard");

  const { error } = await searchParams;
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;

  return (
    <p
      role="alert"
      className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE}
    </p>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
