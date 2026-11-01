import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/dal";

// Example private API route: every private Route Handler should start with this check.
export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ email: user.email, name: user.name });
}
