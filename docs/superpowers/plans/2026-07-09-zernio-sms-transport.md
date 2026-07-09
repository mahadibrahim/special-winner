# Zernio SMS Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zernio as a config-selectable outbound SMS vendor, with Twilio remaining the default fallback, shipped parked until the Zernio number's carrier registration is approved.

**Architecture:** A new thin Zernio SMS transport client (`src/lib/sms/zernio-sms.ts`) sits alongside the existing Twilio client. A provider resolver (`SMS_PROVIDER` env) decides which transport `sendSms()` dispatches to, after the shared opt-in gate / normalization / length cap. Unset `SMS_PROVIDER` ⇒ `twilio`, so current behavior is unchanged.

**Tech Stack:** TypeScript, Astro (`import.meta.env` for server-side secrets), Vitest (unit tests with injected `fetchImpl` + `env` — no global mocking), Drizzle (unchanged, opt-in gate only).

## Global Constraints

- **Default provider is `twilio`.** `SMS_PROVIDER` unset or any value other than `zernio` ⇒ Twilio. Production behavior must be byte-for-byte unchanged until the flag is flipped.
- **Zernio SMS base URL:** `https://zernio.com/api/v1`; endpoint `POST /v1/sms/messages`; auth `Authorization: Bearer <ZERNIO_API_KEY>`.
- **Reuse `ZERNIO_API_KEY`** (already in `.env.example`). New env: `ZERNIO_SMS_FROM` (E.164 sender), `SMS_PROVIDER`.
- **Testability pattern (match `src/lib/zernio/messaging.ts`):** config functions take an optional `env` param defaulting to `import.meta.env`; clients take an injectable `fetchImpl`. No global `import.meta.env` or `fetch` mocking.
- **Result contract of `sendSms()` is unchanged:** `{ ok: true, messageId }` on success. The reason union renames `twilio_error` → `provider_error` (vendor-neutral); no other reason changes.
- **Scope:** outbound text only. No MMS through `sendSms`, no idempotency key, no inbound SMS handling, no removal of Twilio.
- Run unit tests with `npx vitest run <path>` from `web-app/`.

---

### Task 1: Zernio SMS transport client

**Files:**
- Create: `src/lib/sms/zernio-sms.ts`
- Test: `tests/unit/sms/zernio-sms.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `interface ZernioSmsClientConfig { apiKey: string; from: string; baseUrl?: string; fetchImpl?: typeof fetch }`
  - `interface SendZernioSmsInput { to: string; text: string; mediaUrls?: string[] }`
  - `interface ZernioSmsResult { id: string; conversationId?: string; status?: string }`
  - `createZernioSmsClient(config: ZernioSmsClientConfig): { send(input: SendZernioSmsInput): Promise<ZernioSmsResult> }`
  - `type ZernioSmsClient = ReturnType<typeof createZernioSmsClient>`
  - `isZernioSmsConfigured(env?): boolean` — true iff `ZERNIO_API_KEY` **and** `ZERNIO_SMS_FROM` present
  - `createZernioSmsClientFromEnv(env?, fetchImpl?): ZernioSmsClient` — throws if either env var missing

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sms/zernio-sms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createZernioSmsClient,
  createZernioSmsClientFromEnv,
  isZernioSmsConfigured,
} from "@/lib/sms/zernio-sms";

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(captured: Captured, responseBody: unknown = { id: "sms_1", conversationId: "c1", status: "sent" }, status = 200) {
  return async (url: string, init: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("Zernio SMS client", () => {
  it("send posts to /sms/messages with bearer auth and from/to/text body, returning the id", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "test-key",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    const res = await client.send({ to: "+16145550111", text: "Practice at 5pm" });

    expect(captured.url).toBe("https://zernio.com/api/v1/sms/messages");
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer test-key");
    expect(captured.init?.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "Practice at 5pm",
    });
    expect(res).toEqual({ id: "sms_1", conversationId: "c1", status: "sent" });
  });

  it("send includes mediaUrls when provided (MMS)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    await client.send({ to: "+16145550111", text: "flyer", mediaUrls: ["https://x/y.jpg"] });

    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "flyer",
      mediaUrls: ["https://x/y.jpg"],
    });
  });

  it("send throws with the API error detail on 404 (no SMS-enabled number)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured, { error: "No SMS-enabled number matches from" }, 404) as unknown as typeof fetch,
    });

    await expect(client.send({ to: "+16145550111", text: "hi" })).rejects.toThrow(
      /404.*No SMS-enabled number matches from/,
    );
  });

  it("send throws with the API error detail on 502 (carrier failed)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured, { error: "Carrier send failed" }, 502) as unknown as typeof fetch,
    });

    await expect(client.send({ to: "+16145550111", text: "hi" })).rejects.toThrow(/502.*Carrier send failed/);
  });
});

describe("Zernio SMS config from env", () => {
  it("isZernioSmsConfigured is true only when both API key and from number are present", () => {
    expect(isZernioSmsConfigured({ ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" })).toBe(true);
    expect(isZernioSmsConfigured({ ZERNIO_API_KEY: "k" })).toBe(false);
    expect(isZernioSmsConfigured({ ZERNIO_SMS_FROM: "+16145550100" })).toBe(false);
    expect(isZernioSmsConfigured({})).toBe(false);
  });

  it("createZernioSmsClientFromEnv throws a clear error when ZERNIO_API_KEY is missing", () => {
    expect(() => createZernioSmsClientFromEnv({ ZERNIO_SMS_FROM: "+16145550100" })).toThrow(/ZERNIO_API_KEY/);
  });

  it("createZernioSmsClientFromEnv throws a clear error when ZERNIO_SMS_FROM is missing", () => {
    expect(() => createZernioSmsClientFromEnv({ ZERNIO_API_KEY: "k" })).toThrow(/ZERNIO_SMS_FROM/);
  });

  it("createZernioSmsClientFromEnv builds a client that sends with the env-supplied credentials", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClientFromEnv(
      { ZERNIO_API_KEY: "env-key", ZERNIO_SMS_FROM: "+16145550100" },
      fakeFetch(captured) as unknown as typeof fetch,
    );

    await client.send({ to: "+16145550111", text: "hi" });

    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer env-key");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "hi",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sms/zernio-sms.test.ts`
Expected: FAIL — cannot resolve `@/lib/sms/zernio-sms` / exports not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sms/zernio-sms.ts`:

```ts
/**
 * Zernio SMS transport client.
 *
 * Thin typed wrapper over Zernio's SMS endpoint (POST /v1/sms/messages). This is
 * a SEPARATE client from `src/lib/zernio/messaging.ts` (which is WhatsApp
 * account-based, keyed on accountId/conversationId); SMS is from/to E.164-based
 * with a different response shape. `fetchImpl` is injectable for unit testing.
 *
 * Transport layer only — opt-in checks and provider selection live in
 * `src/lib/sms/send.ts`, which calls into this.
 */

const DEFAULT_BASE_URL = "https://zernio.com/api/v1";

export interface ZernioSmsClientConfig {
  apiKey: string;
  from: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SendZernioSmsInput {
  to: string;
  text: string;
  mediaUrls?: string[];
}

export interface ZernioSmsResult {
  id: string;
  conversationId?: string;
  status?: string;
}

export function createZernioSmsClient(config: ZernioSmsClientConfig) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;

  return {
    /** Send an SMS (or MMS when mediaUrls is set) from the configured number. */
    async send(input: SendZernioSmsInput): Promise<ZernioSmsResult> {
      const body: Record<string, unknown> = {
        from: config.from,
        to: input.to,
        text: input.text,
      };
      if (input.mediaUrls !== undefined) body.mediaUrls = input.mediaUrls;

      const res = await doFetch(`${baseUrl}/sms/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Zernio returns JSON error bodies, e.g. {"error":"..."} for 401/404/
        // 409/422/502. Surface the detail so callers log the real cause
        // (404 = no SMS-enabled number matches `from`; 502 = carrier failed).
        let detail = "";
        try {
          const errBody = (await res.json()) as Record<string, unknown>;
          detail = typeof errBody.error === "string" ? errBody.error : JSON.stringify(errBody);
        } catch {
          detail = "(non-JSON error body)";
        }
        throw new Error(`Zernio SMS ${res.status} on /sms/messages: ${detail}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      return {
        id: String(data.id ?? ""),
        conversationId: data.conversationId as string | undefined,
        status: data.status as string | undefined,
      };
    },
  };
}

export type ZernioSmsClient = ReturnType<typeof createZernioSmsClient>;

interface ZernioSmsEnv {
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/** True when both Zernio SMS credentials are present (SMS via Zernio can be enabled). */
export function isZernioSmsConfigured(
  env: ZernioSmsEnv = import.meta.env as unknown as ZernioSmsEnv,
): boolean {
  return Boolean(env.ZERNIO_API_KEY && env.ZERNIO_SMS_FROM);
}

/**
 * Build an SMS client from environment credentials. Throws a clear error if
 * unconfigured so callers fail loudly rather than send nowhere.
 */
export function createZernioSmsClientFromEnv(
  env: ZernioSmsEnv = import.meta.env as unknown as ZernioSmsEnv,
  fetchImpl?: typeof fetch,
): ZernioSmsClient {
  if (!env.ZERNIO_API_KEY) {
    throw new Error("Zernio SMS not configured. Set ZERNIO_API_KEY to enable the Zernio SMS provider.");
  }
  if (!env.ZERNIO_SMS_FROM) {
    throw new Error("Zernio SMS not configured. Set ZERNIO_SMS_FROM (E.164 sender) to enable the Zernio SMS provider.");
  }
  return createZernioSmsClient({
    apiKey: env.ZERNIO_API_KEY,
    from: env.ZERNIO_SMS_FROM,
    fetchImpl,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sms/zernio-sms.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms/zernio-sms.ts tests/unit/sms/zernio-sms.test.ts
git commit -m "feat(sms): add Zernio SMS transport client"
```

---

### Task 2: Provider-aware config + selection

**Files:**
- Modify: `src/lib/sms/client.ts`
- Test: `tests/unit/sms/provider.test.ts`

**Interfaces:**
- Consumes: `isZernioSmsConfigured(env?)` from Task 1.
- Produces:
  - `type SmsProvider = "twilio" | "zernio"`
  - `getSmsProvider(env?): SmsProvider` — `"zernio"` iff `env.SMS_PROVIDER === "zernio"`, else `"twilio"`
  - `isSmsConfigured(env?): boolean` — now provider-aware; still exported with the same name, callable with no args (default env)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sms/provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getSmsProvider, isSmsConfigured } from "@/lib/sms/client";

describe("SMS provider selection", () => {
  it("defaults to twilio when SMS_PROVIDER is unset", () => {
    expect(getSmsProvider({})).toBe("twilio");
  });

  it("defaults to twilio for any value other than 'zernio'", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "TWILIO" })).toBe("twilio");
    expect(getSmsProvider({ SMS_PROVIDER: "sinch" })).toBe("twilio");
  });

  it("selects zernio only for the exact value 'zernio'", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "zernio" })).toBe("zernio");
  });
});

describe("isSmsConfigured is provider-aware", () => {
  it("checks Twilio creds when provider is twilio", () => {
    expect(
      isSmsConfigured({
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_PHONE_NUMBER: "+16145550100",
      }),
    ).toBe(true);
    expect(isSmsConfigured({ TWILIO_ACCOUNT_SID: "AC1" })).toBe(false);
  });

  it("checks Zernio SMS creds when provider is zernio", () => {
    expect(
      isSmsConfigured({
        SMS_PROVIDER: "zernio",
        ZERNIO_API_KEY: "k",
        ZERNIO_SMS_FROM: "+16145550100",
      }),
    ).toBe(true);
    // Twilio creds present but provider is zernio and zernio creds missing → false
    expect(
      isSmsConfigured({
        SMS_PROVIDER: "zernio",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_PHONE_NUMBER: "+16145550100",
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sms/provider.test.ts`
Expected: FAIL — `getSmsProvider` not exported; `isSmsConfigured` does not accept an env arg.

- [ ] **Step 3: Write minimal implementation**

Modify `src/lib/sms/client.ts`. Add the import at the top (after the `twilio` import):

```ts
import { isZernioSmsConfigured } from "./zernio-sms";
```

Add an env interface and the provider resolver, and rewrite `isSmsConfigured` to accept an optional env and be provider-aware. Replace the existing `isSmsConfigured` function with:

```ts
export type SmsProvider = "twilio" | "zernio";

interface SmsEnv {
  SMS_PROVIDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/** Active outbound SMS vendor. Unset (or any non-"zernio" value) ⇒ twilio. */
export function getSmsProvider(
  env: SmsEnv = import.meta.env as unknown as SmsEnv,
): SmsProvider {
  return env.SMS_PROVIDER === "zernio" ? "zernio" : "twilio";
}

export function isSmsConfigured(
  env: SmsEnv = import.meta.env as unknown as SmsEnv,
): boolean {
  if (getSmsProvider(env) === "zernio") {
    return isZernioSmsConfigured(env);
  }
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      (env.TWILIO_PHONE_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID),
  );
}
```

Leave `getTwilioClient()` and `getSmsFrom()` unchanged (they read `import.meta.env` directly; only used on the Twilio path).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sms/provider.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the existing zernio suite to confirm no regression**

Run: `npx vitest run tests/unit/sms tests/unit/zernio`
Expected: PASS (all — 32 prior + new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sms/client.ts tests/unit/sms/provider.test.ts
git commit -m "feat(sms): provider-aware isSmsConfigured + getSmsProvider resolver"
```

---

### Task 3: Dispatch `sendSms` through the selected provider

**Files:**
- Modify: `src/lib/sms/send.ts`
- Test: `tests/unit/sms/dispatch.test.ts`

**Interfaces:**
- Consumes: `getSmsProvider(env?)` (Task 2), `createZernioSmsClientFromEnv(env?, fetchImpl?)` (Task 1), `getTwilioClient()` / `getSmsFrom()` (existing).
- Produces:
  - `dispatchToProvider(input: { to: string; text: string }, env?, fetchImpl?): Promise<{ messageId: string }>` — routes to the active transport and returns the provider message id. Throws on transport error (caller maps to `provider_error`).
- Behavior change: `SendSmsResult` reason `twilio_error` → `provider_error`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sms/dispatch.test.ts` (tests only the Zernio route + routing decision — the Twilio route needs live SDK creds and is exercised in prod, unchanged):

```ts
import { describe, it, expect } from "vitest";
import { dispatchToProvider } from "@/lib/sms/send";

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(captured: Captured, responseBody: unknown = { id: "sms_9", status: "sent" }, status = 200) {
  return async (url: string, init: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("dispatchToProvider", () => {
  it("routes to Zernio and returns the Zernio message id as messageId when SMS_PROVIDER=zernio", async () => {
    const captured: Captured = {};
    const res = await dispatchToProvider(
      { to: "+16145550111", text: "Game moved to 6pm" },
      { SMS_PROVIDER: "zernio", ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" },
      fakeFetch(captured) as unknown as typeof fetch,
    );

    expect(captured.url).toBe("https://zernio.com/api/v1/sms/messages");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "Game moved to 6pm",
    });
    expect(res).toEqual({ messageId: "sms_9" });
  });

  it("propagates a Zernio transport error (so sendSms maps it to provider_error)", async () => {
    const captured: Captured = {};
    await expect(
      dispatchToProvider(
        { to: "+16145550111", text: "hi" },
        { SMS_PROVIDER: "zernio", ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" },
        fakeFetch(captured, { error: "Carrier send failed" }, 502) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/502.*Carrier send failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sms/dispatch.test.ts`
Expected: FAIL — `dispatchToProvider` not exported from `@/lib/sms/send`.

- [ ] **Step 3: Write minimal implementation**

Modify `src/lib/sms/send.ts`:

(a) Update the imports at the top:

```ts
import { getTwilioClient, getSmsFrom, isSmsConfigured, getSmsProvider } from "./client";
import { createZernioSmsClientFromEnv } from "./zernio-sms";
```

(b) In the `SendSmsResult` reason union, rename `twilio_error` to `provider_error`:

```ts
export type SendSmsResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "not_opted_in"
        | "opted_out"
        | "provider_error"
        | "invalid_phone";
      error?: string;
    };
```

(c) Add the dispatch helper (place it above `sendSms`):

```ts
interface DispatchEnv {
  SMS_PROVIDER?: string;
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/**
 * Route an already-gated, already-normalized message to the active SMS vendor
 * and return the provider's message id. Throws on transport failure — the
 * caller (sendSms) maps that to reason "provider_error".
 */
export async function dispatchToProvider(
  input: { to: string; text: string },
  env: DispatchEnv = import.meta.env as unknown as DispatchEnv,
  fetchImpl?: typeof fetch,
): Promise<{ messageId: string }> {
  if (getSmsProvider(env) === "zernio") {
    const client = createZernioSmsClientFromEnv(env, fetchImpl);
    const res = await client.send({ to: input.to, text: input.text });
    return { messageId: res.id };
  }

  const client = getTwilioClient();
  const sender = getSmsFrom();
  const message = await client.messages.create({ ...sender, to: input.to, body: input.text });
  return { messageId: message.sid };
}
```

(d) Replace the Twilio send block inside `sendSms` (the current `try { const client = getTwilioClient(); ... return { ok: true, messageId: message.sid }; } catch ...`) with a call to the dispatcher:

```ts
  try {
    const { messageId } = await dispatchToProvider({ to: input.to, text: body });
    return { ok: true, messageId };
  } catch (error) {
    console.error("SMS send error:", error);
    return {
      ok: false,
      reason: "provider_error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
```

Leave everything else in `sendSms` (config check, phone validation, opt-in gate, length cap, `normalizeUsPhone`) untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sms/dispatch.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck (catches the reason rename ripple)**

Run: `npx tsc --noEmit`
Expected: zero errors. If any file referenced `twilio_error` in a type position it would surface here — the grep at design time found none, so this should be clean.

- [ ] **Step 6: Full SMS + zernio unit suite**

Run: `npx vitest run tests/unit/sms tests/unit/zernio`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sms/send.ts tests/unit/sms/dispatch.test.ts
git commit -m "feat(sms): dispatch sendSms through selected provider; rename twilio_error to provider_error"
```

---

### Task 4: Env docs + un-park checklist

**Files:**
- Modify: `.env.example`
- Create: `docs/operations/zernio-sms-unpark-checklist.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the env vars to `.env.example`**

In the SMS section (currently starting `# SMS — Twilio (required for Phase 1 pilot launch)`), add below the Twilio block:

```bash
# SMS provider selection. Unset or "twilio" ⇒ Twilio (default). "zernio" routes
# outbound SMS through Zernio instead. Keep as twilio until the Zernio number's
# US carrier registration is approved (see docs/operations/zernio-sms-unpark-checklist.md).
SMS_PROVIDER=twilio

# Zernio SMS sender (E.164). Only used when SMS_PROVIDER=zernio. Reuses
# ZERNIO_API_KEY (defined in the Zernio section below). Must be an SMS-enabled,
# carrier-registered number in the Zernio account.
ZERNIO_SMS_FROM=
```

- [ ] **Step 2: Write the un-park checklist doc**

Create `docs/operations/zernio-sms-unpark-checklist.md`:

```markdown
# Zernio SMS — un-park checklist

Outbound SMS can run through either Twilio (default) or Zernio, chosen by the
`SMS_PROVIDER` env var. The Zernio transport is built and tested but **parked**:
`SMS_PROVIDER` stays `twilio` until the steps below are green.

## Why parked

Zernio SMS to US numbers only delivers once the sending number has an **approved
carrier registration** (`/v1/sms/registrations`) — the same 10DLC hurdle Twilio
imposes. A number working for WhatsApp does **not** imply it is SMS-enabled:
WhatsApp and SMS are separate rails with separate registration.

Carrier registration was submitted **2026-07-09** and is pending approval.

## Un-park steps

1. **Confirm the number is SMS-enabled** in the Zernio account (the number used
   for WhatsApp may not be). If it is not, provision/enable an SMS number.
2. **Confirm the carrier registration is approved** (`/v1/sms/registrations`).
   Until then, sends return `404 No SMS-enabled number matches from` or a `502`
   carrier failure.
3. **Set the env vars** (Netlify prod + Bitwarden `aspire-web-app`):
   - `ZERNIO_SMS_FROM` = the approved SMS-enabled number in E.164.
   - `SMS_PROVIDER` = `zernio`.
4. **Send one live verification text** through `sendSms()` and confirm delivery
   before relying on it for real traffic.
5. **Before real cutover, wire inbound.** Under Zernio, inbound SMS replies
   thread into a Zernio inbox conversation and arrive via the existing Zernio
   webhook (`/api/webhooks/zernio`), NOT the Twilio-shaped
   `src/pages/api/messaging/inbound/sms.ts` route. Inbound handling is separate,
   later work.

## Rollback

Set `SMS_PROVIDER` back to `twilio` and redeploy. Twilio stays fully wired; no
code change is needed to revert.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/operations/zernio-sms-unpark-checklist.md
git commit -m "docs(sms): document SMS_PROVIDER/ZERNIO_SMS_FROM + Zernio un-park checklist"
```

---

## Self-Review

**Spec coverage:**
- §1 New transport `zernio-sms.ts` → Task 1 ✓
- §2 Provider selection (`SMS_PROVIDER`, provider-aware `isSmsConfigured`, dispatch, `provider_error` rename) → Tasks 2 + 3 ✓
- §3 v1 scope: text-only (mediaUrls supported in client, not exposed by `sendSms`) ✓; no idempotency key ✓; inbound out of scope (documented) ✓
- §4 Verification / un-park gate → Task 4 doc ✓ (optional status-check *script* intentionally omitted: the only Zernio SMS endpoint confirmed by the reference is `POST /v1/sms/messages`; a `GET /v1/sms/registrations` shape is unverified, so the checklist uses documented manual steps rather than inventing an endpoint — consistent with "optional")
- §5 Tests: transport tests (Task 1), provider-selection tests (Tasks 2 + 3) ✓
- Files touched list → all four tasks cover the spec's file list ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `ZernioSmsResult.id` (Task 1) → `res.id` → `{ messageId }` (Task 3). `getSmsProvider` / `isZernioSmsConfigured` / `createZernioSmsClientFromEnv` signatures identical across Tasks 1–3. Reason renamed to `provider_error` in exactly one place (Task 3b) and produced in exactly one place (Task 3d). ✓
```
