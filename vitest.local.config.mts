import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Tests that write shared state (e.g. Weight Tracker settings) run ONLY against an isolated
 * local database: LOCAL_TEST_DATABASE_URL must point to localhost/127.0.0.1, otherwise the run
 * aborts. Example: a Docker postgres restored from a backup, then `prisma migrate deploy`.
 */
const url = process.env.LOCAL_TEST_DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error("LOCAL_TEST_DATABASE_URL must be set to a localhost database. Refusing to run.");
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      { find: /^server-only$/, replacement: `${root}tests/stubs/server-only.ts` },
    ],
  },
  test: {
    include: ["tests/integration-local/**/*.test.ts"],
    environment: "node",
    env: { DATABASE_URL: url },
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
