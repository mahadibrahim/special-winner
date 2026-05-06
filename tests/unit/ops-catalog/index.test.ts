import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");
const cliPath = path.join(repoRoot, "scripts/ops-catalog/index.ts");

describe("ops-catalog CLI", () => {
  it("prints usage when called without args", () => {
    const result = (() => {
      try {
        execSync(`npx tsx ${cliPath}`, { stdio: "pipe", cwd: repoRoot });
        return { code: 0, stderr: "" };
      } catch (e: any) {
        return { code: e.status, stderr: e.stderr.toString() };
      }
    })();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage: ops-catalog");
  });

  it("runs validate command without error", () => {
    const out = execSync(`npx tsx ${cliPath} validate`, { cwd: repoRoot }).toString();
    expect(out).toContain("not yet implemented");
  });
});
