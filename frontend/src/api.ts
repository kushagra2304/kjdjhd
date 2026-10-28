// Typed fetch helpers. URLs are relative so the same build works behind the
// Vite dev proxy, the Docker nginx proxy and the Vercel rewrite.
import type { Comparison, HorizonErrorPoint, Meta } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** FastAPI errors are {detail: string} or, for validation, {detail: [{msg}, ...]}. */
function describeError(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => (d as { msg?: string }).msg ?? String(d)).join('; ')
  }
  return fallback
}

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(query ? `${path}?${query}` : path, { signal })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new ApiError(response.status, describeError(body, `Request failed (HTTP ${response.status})`))
  }
  return (await response.json()) as T
}

export function fetchMeta(signal?: AbortSignal): Promise<Meta> {
  return getJson<Meta>('/api/meta', {}, signal)
}

export function fetchComparison(start: string, end: string, horizon: number, signal?: AbortSignal): Promise<Comparison> {
  return getJson<Comparison>('/api/comparison', { start, end, horizon: String(horizon) }, signal)
}

export function fetchHorizonError(start: string, end: string, signal?: AbortSignal): Promise<HorizonErrorPoint[]> {
  return getJson<HorizonErrorPoint[]>('/api/horizon-error', { start, end }, signal)
}
