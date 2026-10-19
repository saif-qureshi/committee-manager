export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`Request failed (${status})`);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('EXPO_PUBLIC_API_URL is not configured');
  const { token, ...request } = options;
  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json');
  if (request.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${base.replace(/\/$/, '')}/api/v1${path}`, {
    ...request,
    headers,
    signal: request.signal
      ? AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.status === 204 ? (undefined as T) : response.json();
}
