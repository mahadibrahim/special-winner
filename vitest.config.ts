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
          testTimeout: 15000,
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
