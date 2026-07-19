/**
 * Fetch rental availability with a small retry on TRANSIENT failures.
 *
 * The public `/api/rentals/availability` read occasionally hits a transient
 * Railway DB-connectivity blip (CONNECT_TIMEOUT / CONNECTION_CLOSED); the
 * endpoint's catch-all turns that into a blanket 500, which the booking grid
 * would otherwise surface to the user as "Couldn't load availability: HTTP
 * 500" with no recovery. A couple of quick retries let a blip self-heal.
 *
 * Only retries transient conditions:
 *   - a network-level fetch rejection (not an AbortError)
 *   - a 5xx response
 * A 4xx (bad venue id, disabled venue) is a real client error and is thrown
 * immediately — retrying it would just waste time.
 */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchRentalAvailability<T>(
  venueId: string,
  date: string,
  opts?: { retries?: number; signal?: AbortSignal },
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const url = `/api/rentals/availability?venueId=${encodeURIComponent(
    venueId,
  )}&date=${encodeURIComponent(date)}`;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: opts?.signal });
    } catch (err) {
      // Network-level failure. An intentional abort must not be retried.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (attempt < retries) {
        await wait(300 * (attempt + 1));
        continue;
      }
      throw err;
    }

    if (res.ok) return (await res.json()) as T;

    // Retry transient server errors only; a 4xx is a real client error.
    if (res.status >= 500 && attempt < retries) {
      await wait(300 * (attempt + 1));
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
  }
}
