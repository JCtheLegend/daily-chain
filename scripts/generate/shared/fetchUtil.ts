import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CACHE_DIR = join(import.meta.dirname, '..', '.cache')

export const USER_AGENT = 'DailyChainGameDataBot/0.2 (https://github.com/JCtheLegend/daily-chain)'

interface FetchOptions {
  headers?: Record<string, string>
  method?: 'GET' | 'POST'
  body?: string
  /** Re-fetch when the cached copy is older than this. Default: cache forever. */
  maxAgeMs?: number
  /** Resolve to null instead of throwing on a 404. */
  allow404?: boolean
  retries?: number
}

function cachePathFor(key: string): string {
  return join(CACHE_DIR, createHash('sha256').update(key).digest('hex'))
}

/**
 * GETs (or POSTs) with an on-disk cache and retry/backoff on 429/5xx. Free APIs
 * have tight limits and much of this data (past seasons, old movies) never
 * changes, so re-running generation shouldn't re-download it.
 */
export async function fetchBytesCached(url: string, options: FetchOptions = {}): Promise<Buffer | null> {
  const cachePath = cachePathFor(`${options.method ?? 'GET'} ${url} ${options.body ?? ''}`)
  if (existsSync(cachePath)) {
    const fresh = options.maxAgeMs === undefined || Date.now() - statSync(cachePath).mtimeMs < options.maxAgeMs
    if (fresh) {
      const cached = readFileSync(cachePath)
      return cached.length === 0 ? null : cached
    }
  }

  const maxRetries = options.retries ?? 5
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, {
        method: options.method ?? 'GET',
        body: options.body,
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
      })
    } catch (e) {
      lastError = e as Error // network hiccup — retry
      continue
    }
    if (res.ok) {
      const data = Buffer.from(await res.arrayBuffer())
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, data)
      return data
    }
    if (res.status === 404 && options.allow404) {
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, '') // remember the miss too
      return null
    }
    lastError = new Error(`${options.method ?? 'GET'} ${url} -> ${res.status} ${res.statusText}`)
    if (res.status !== 429 && res.status < 500) throw lastError
  }
  throw lastError
}

export async function fetchJsonCached<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const bytes = await fetchBytesCached(url, { ...options, headers: { Accept: 'application/json', ...options.headers } })
  if (!bytes) throw new Error(`GET ${url} -> 404`)
  return JSON.parse(bytes.toString('utf-8')) as T
}

export async function fetchJsonOrNull<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
  const bytes = await fetchBytesCached(url, { ...options, allow404: true, headers: { Accept: 'application/json', ...options.headers } })
  return bytes ? (JSON.parse(bytes.toString('utf-8')) as T) : null
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Spaces calls at least `minIntervalMs` apart, even when awaited concurrently. */
export function createRateLimiter(minIntervalMs: number) {
  let nextSlot = 0
  return async function wait() {
    const now = Date.now()
    const slot = Math.max(now, nextSlot)
    nextSlot = slot + minIntervalMs
    if (slot > now) await sleep(slot - now)
  }
}

/** Maps with at most `concurrency` promises in flight. */
export async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

const DAY = 86_400_000
export const WEEK_MS = 7 * DAY
