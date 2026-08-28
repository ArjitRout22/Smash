import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    // Unit tests for pure logic run in node; component tests opt into jsdom
    // via a `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
    // Integration suites all share ONE Postgres and seed common rows (e.g. the
    // "ADMIN" role via a non-atomic Prisma upsert). Running test files in parallel
    // let two suites race on those inserts → intermittent "Unique constraint failed
    // on (name)" in a beforeAll. Run files serially: DB tests are the bulk of the
    // time anyway, and the unit tests are milliseconds.
    fileParallelism: false,
  },
});
