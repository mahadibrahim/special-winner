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
          // 30s per test: the tag-queue endpoint does N+1 lookups per queued
          // session and CI's shared DB accumulates enough uploaded sessions
          // that a single GET can take several seconds. See
          // src/pages/api/admin/media/tag-queue.ts — proper fix is a JOIN,
          // but bumping the timeout is zero-risk for now.
          testTimeout: 30000,
          hookTimeout: 30000,
        },
        resolve: { alias },
      },
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
        resolve: { alias },
      },
    ],
  },
});
