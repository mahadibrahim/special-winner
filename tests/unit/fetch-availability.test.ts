import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchRentalAvailability } from "@/lib/rentals/fetch-availability";

const okBody = { venueName: "Test", date: "2026-07-21", fields: [] };
const okResponse = () =>
  new Response(JSON.stringify(okBody), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const errResponse = (status: number, error?: string) =>
  new Response(JSON.stringify(error ? { error } : {}), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRentalAvailability", () => {
  it("returns the parsed body on a first-try 200 (no retry)", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const body = await fetchRentalAvailability("v1", "2026-07-21");
    expect(body).toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // URL is correctly encoded
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      "/api/rentals/availability?venueId=v1&date=2026-07-21",
    );
  });

  it("retries a transient 500 and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(500))
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const body = await fetchRentalAvailability("v1", "2026-07-21", { retries: 2 });
    expect(body).toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries on persistent 5xx", async () => {
    const fetchMock = vi.fn(async () => errResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRentalAvailability("v1", "2026-07-21", { retries: 1 }),
    ).rejects.toThrow("HTTP 500");
    // initial attempt + 1 retry
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx client error and surfaces the server error message", async () => {
    const fetchMock = vi.fn(async () => errResponse(400, "Unknown venue"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRentalAvailability("bad", "2026-07-21", { retries: 2 }),
    ).rejects.toThrow("Unknown venue");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a network-level fetch rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const body = await fetchRentalAvailability("v1", "2026-07-21", { retries: 2 });
    expect(body).toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry an AbortError", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRentalAvailability("v1", "2026-07-21", { retries: 2 }),
    ).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
