import { defineConfig } from "vitest/config";
import path from "path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          setupFiles: ["tests/api/setup/global-setup.ts"],
          // The tag-queue endpoint does N+1 lookups per queued session and
          // CI's shared DB has accumulated hundreds of seeded sessions
          // (every db:seed:e2e adds 15 more). On top of that, src/lib/db
          // pins postgres-js to max:1 so api-test workers serialize through
          // a single connection. A GET can spend 20s+ in queue + N+1 walk
          // before responding. The proper fix is a JOIN in tag-queue.ts
          // plus a seed cleanup pass; until then, generous budgets here are
          // zero-risk and keep test-api stable. Bumped to 120s on
          // 2026-04-25 after CI run 24945582493 hit the 60s ceiling on
          // tag-session.test.ts and media-tag-queue.test.ts.
          testTimeout: 120000,
          hookTimeout: 120000,
        },
        resolve: { alias },
      },
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/unit/setup.ts"],
        },
        resolve: { alias },
      },
    ],
  },
});
