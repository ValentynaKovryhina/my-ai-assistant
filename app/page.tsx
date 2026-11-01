import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthorizedUser } from "@/lib/dal";

// proxy.ts normally redirects "/" before rendering; this is the server-side fallback.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <RedirectToStart />
    </Suspense>
  );
}

async function RedirectToStart(): Promise<never> {
  const user = await getAuthorizedUser();
  redirect(user ? "/dashboard" : "/login");
}
