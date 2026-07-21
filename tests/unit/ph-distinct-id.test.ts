import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parsePhDistinctId, collectAdAttribution } from "@/lib/analytics/parse-cookies";

const TOKEN = "phc_testtoken123";
const phCookie = (payload: unknown) =>
  `ph_${TOKEN}_posthog=${encodeURIComponent(JSON.stringify(payload))}`;

describe("parsePhDistinctId", () => {
  let prevToken: string | undefined;
  beforeEach(() => {
    prevToken = process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
    process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = TOKEN;
  });
  afterEach(() => {
    if (prevToken === undefined) delete process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
    else process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = prevToken;
  });

  it("reads distinct_id from the posthog persistence cookie", () => {
    const header = `_ga=GA1.1.111.222; ${phCookie({ distinct_id: "0198abc-device-id" })}; other=x`;
    expect(parsePhDistinctId(header)).toBe("0198abc-device-id");
  });

  it("returns null when the cookie is absent, malformed, or id is not a string", () => {
    expect(parsePhDistinctId(null)).toBeNull();
    expect(parsePhDistinctId("other=x")).toBeNull();
    expect(parsePhDistinctId(`ph_${TOKEN}_posthog=%7Bnot-json`)).toBeNull();
    expect(parsePhDistinctId(phCookie({ distinct_id: 42 }))).toBeNull();
    expect(parsePhDistinctId(phCookie({}))).toBeNull();
  });

  it("flows into collectAdAttribution as ph_distinct_id", () => {
    const url = new URL("https://aspiresportsohio.com/register/x");
    const out = collectAdAttribution(url, phCookie({ distinct_id: "dev-9" }));
    expect(out.ph_distinct_id).toBe("dev-9");
    // absent cookie → key omitted entirely (Stripe metadata must not carry "")
    expect(collectAdAttribution(url, "a=b")).not.toHaveProperty("ph_distinct_id");
  });
});
