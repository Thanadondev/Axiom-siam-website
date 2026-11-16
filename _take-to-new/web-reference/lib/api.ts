const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApiOptions extends RequestInit {
  token?: string | null;
}

/** Error carrying the API's response body, so callers can read flags like `twoFactorRequired`. */
export interface ApiError extends Error {
  status?: number;
  body?: Record<string, any>;
}

/** Fetch wrapper for the Axiom API. Sends cookies (for refresh token) + optional Bearer. */
export async function apiFetch<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && (data.message as string)) || `เกิดข้อผิดพลาด (${res.status})`) as ApiError;
    err.status = res.status;
    err.body = data; // callers read flags like `twoFactorRequired`
    throw err;
  }
  return data as T;
}
