const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApiOptions extends RequestInit {
  token?: string | null;
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
    throw new Error((data && (data.message as string)) || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data as T;
}
