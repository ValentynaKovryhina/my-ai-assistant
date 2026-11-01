import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Integration tests against the database in DATABASE_URL (.env). They create only records
 * whose titles/names start with "__claude_e2e__" and delete only those records afterwards.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      { find: /^server-only$/, replacement: `${root}tests/stubs/server-only.ts` },
    ],
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
