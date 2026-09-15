import { remoteJsonGet } from './remoteApi'

/** Allowed |PC − trusted| skew before blocking the app. */
export const CLOCK_MAX_SKEW_MS = 5 * 60 * 1000

const TEHRAN_TZ = 'Asia/Tehran'

export type ClockCheckResult = {
  ok: boolean
  blocked: boolean
  skewMs: number
  maxSkewMs: number
  localTimeMs: number
  trustedTimeMs: number | null
  source: string | null
  localLabel: string
  trustedLabel: string | null
  error?: string
}

function formatTehran(ms: number): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: TEHRAN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString()
  }
}

function parseEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // seconds vs ms
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum)) {
      return asNum < 1e12 ? Math.round(asNum * 1000) : Math.round(asNum)
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

function extractServerTimeMs(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : null

  const candidates: unknown[] = [
    data?.epoch_ms,
    data?.epochMs,
    data?.unix_ms,
    data?.unixMs,
    root.epoch_ms,
    root.epochMs,
    root.unix_ms,
    root.unixMs,
    data?.unix,
    data?.epoch,
    data?.timestamp,
    data?.server_time,
    data?.serverTime,
    data?.datetime,
    data?.dateTime,
    data?.now,
    root.unix,
    root.epoch,
    root.timestamp,
    root.server_time,
    root.serverTime,
    root.datetime,
    root.dateTime,
    root.now,
  ]

  for (const c of candidates) {
    const ms = parseEpochMs(c)
    if (ms != null) return ms
  }
  return null
}

async function fetchFromAppServer(): Promise<{ ms: number; source: string } | null> {
  const response = await remoteJsonGet('/ecrc/api/emdad-phone/server-time')
  if (!response.ok || !response.json) return null
  const ms = extractServerTimeMs(response.json)
  if (ms == null) return null
  return { ms, source: 'emdad-server' }
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchFromTimeApiIo(): Promise<{ ms: number; source: string } | null> {
  const json = (await fetchJson(
    `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(TEHRAN_TZ)}`
  )) as Record<string, unknown> | null
  if (!json) return null
  const ms =
    parseEpochMs(json.dateTime) ||
    parseEpochMs(json.datetime) ||
    null
  if (ms == null) return null
  return { ms, source: 'timeapi.io' }
}

async function fetchFromWorldTimeApi(): Promise<{ ms: number; source: string } | null> {
  const json = (await fetchJson(
    `https://worldtimeapi.org/api/timezone/${encodeURIComponent(TEHRAN_TZ)}`
  )) as Record<string, unknown> | null
  if (!json) return null
  const ms =
    parseEpochMs(json.unixtime) ||
    parseEpochMs(json.datetime) ||
    null
  if (ms == null) return null
  return { ms, source: 'worldtimeapi.org' }
}

async function getTrustedTime(): Promise<{ ms: number; source: string } | null> {
  // Prefer your API when available; free public sources as fallback.
  const sources = [fetchFromAppServer, fetchFromTimeApiIo, fetchFromWorldTimeApi]
  for (const source of sources) {
    try {
      const result = await source()
      if (result) return result
    } catch {
      // try next
    }
  }
  return null
}

/** Lightweight reachability probe (DNS/TCP to well-known endpoints). */
async function isInternetReachable(): Promise<boolean> {
  const probes = [
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://clients3.google.com/generate_204',
    'https://1.1.1.1',
  ]
  for (const url of probes) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      // Any HTTP response means the network path is up
      if (res.status >= 0) return true
    } catch {
      // try next
    } finally {
      clearTimeout(timer)
    }
  }
  return false
}

export async function checkSystemClock(): Promise<ClockCheckResult> {
  const localTimeMs = Date.now()
  const localLabel = formatTehran(localTimeMs)

  const online = await isInternetReachable()
  if (!online) {
    return {
      ok: false,
      blocked: true,
      skewMs: 0,
      maxSkewMs: CLOCK_MAX_SKEW_MS,
      localTimeMs,
      trustedTimeMs: null,
      source: null,
      localLabel,
      trustedLabel: null,
      error: 'offline',
    }
  }

  const trusted = await getTrustedTime()

  if (!trusted) {
    return {
      ok: false,
      blocked: true,
      skewMs: 0,
      maxSkewMs: CLOCK_MAX_SKEW_MS,
      localTimeMs,
      trustedTimeMs: null,
      source: null,
      localLabel,
      trustedLabel: null,
      error: 'trusted_time_unavailable',
    }
  }

  const skewMs = Math.abs(localTimeMs - trusted.ms)
  const blocked = skewMs > CLOCK_MAX_SKEW_MS

  return {
    ok: !blocked,
    blocked,
    skewMs,
    maxSkewMs: CLOCK_MAX_SKEW_MS,
    localTimeMs,
    trustedTimeMs: trusted.ms,
    source: trusted.source,
    localLabel,
    trustedLabel: formatTehran(trusted.ms),
    error: blocked ? 'clock_skew' : undefined,
  }
}
