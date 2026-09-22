import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CACHE_DIR = join(import.meta.dirname, '..', '.cache')

function cachePathFor(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex')
  return join(CACHE_DIR, `${hash}.json`)
}

/**
 * GETs JSON with an on-disk cache (build-time data barely changes day to
 * day, and free APIs have tight rate limits — re-running generation
 * shouldn't re-fetch everything). Pass `noCache: true` for endpoints whose
 * response should always be fresh.
 */
export async function fetchJsonCached<T>(
  url: string,
  options: { headers?: Record<string, string>; noCache?: boolean; retries?: number } = {},
): Promise<T> {
  const cachePath = cachePathFor(url)
  if (!options.noCache && existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as T
  }

  const maxRetries = options.retries ?? 5
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s, 4s, 8s, 16s

    const res = await fetch(url, { headers: options.headers })
    if (res.ok) {
      const data = (await res.json()) as T
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, JSON.stringify(data))
      return data
    }

    const retryable = res.status === 429 || res.status >= 500
    lastError = new Error(`GET ${url} -> ${res.status} ${res.statusText}: ${await res.text().catch(() => '')}`)
    if (!retryable) throw lastError
  }

  throw lastError
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Simple sequential rate limiter: awaits this before each request that must be throttled. */
export function createRateLimiter(minIntervalMs: number) {
  let last = 0
  return async function wait() {
    const now = Date.now()
    const elapsed = now - last
    if (elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed)
    last = Date.now()
  }
}
