import { describe, expect, it } from "vitest";
import { resolvePostHogServerConfig } from "@/lib/posthog-server";

describe("resolvePostHogServerConfig", () => {
  it("enables capture when a token is present and not a test run", () => {
    const config = resolvePostHogServerConfig({
      token: "phc_abc123",
      host: "https://us.i.posthog.com",
    });
    expect(config.enabled).toBe(true);
    expect(config.token).toBe("phc_abc123");
    expect(config.host).toBe("https://us.i.posthog.com");
  });

  it("disables capture when no token is configured", () => {
    const config = resolvePostHogServerConfig({});
    expect(config.enabled).toBe(false);
  });

  it("disables capture on test-endpoint servers (CI and local API-test runs)", () => {
    const config = resolvePostHogServerConfig({
      token: "phc_abc123",
      e2eTestEndpoints: "yes",
    });
    expect(config.enabled).toBe(false);
  });

  it("disables capture under NODE_ENV=test", () => {
    const config = resolvePostHogServerConfig({
      token: "phc_abc123",
      nodeEnv: "test",
    });
    expect(config.enabled).toBe(false);
  });

  it("stays enabled when E2E_TEST_ENDPOINTS is unset or not 'yes'", () => {
    expect(
      resolvePostHogServerConfig({ token: "phc_abc123", e2eTestEndpoints: "no" }).enabled,
    ).toBe(true);
    expect(
      resolvePostHogServerConfig({ token: "phc_abc123", nodeEnv: "production" }).enabled,
    ).toBe(true);
  });
});
