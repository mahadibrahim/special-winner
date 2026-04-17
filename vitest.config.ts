import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    passWithNoTests: true,
    include: ["tests/api/**/*.test.ts"],
    setupFiles: ["tests/api/setup/global-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
