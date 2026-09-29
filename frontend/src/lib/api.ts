export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown };

// On free hosting the API sleeps when idle and takes a little while to wake.
// Meanwhile the proxy answers with a 5xx (Next.js says 500 when the backend is
// unreachable, hosts say 502/503/504), so safe (GET) calls retry for up to
// ~45s; that first GET (/auth/me on page load) wakes the server for the rest.
const GET_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 12000, 15000];
const WAKING_MESSAGE = "The server is waking up (free hosting). Please try again in a few seconds.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function messageFrom(status: number, data: unknown): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  // FastAPI-style list of validation errors: [{msg: "..."}]
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;
  if (status >= 500) return data === null ? WAKING_MESSAGE : "Server error. Please try again.";
  return `Request failed (${status})`;
}

/** Same-origin call to the FastAPI backend through the Next.js /api proxy. */
export async function api<T>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  const retries = method === "GET" ? GET_RETRY_DELAYS_MS : [];
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/v1${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      res = null; // network error
    }

    const retryable = res === null || res.status >= 500;
    if (retryable && attempt < retries.length) {
      await sleep(retries[attempt]);
      continue;
    }
    if (res === null) throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON (e.g. proxy error page) */
    }
    if (!res.ok) throw new ApiError(res.status, messageFrom(res.status, data));
    return data as T;
  }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
