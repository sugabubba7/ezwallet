export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown };

/** Same-origin call to the FastAPI backend through the Next.js /api proxy. */
export async function api<T>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. proxy error page) */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : res.status >= 500
          ? "Server error. Is the backend running?"
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
