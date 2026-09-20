/** Allowed |PC − server| / wall-clock skew before blocking the app. */
export const CLOCK_MAX_SKEW_MS = 5 * 60 * 1000

/** Iran Standard Time is permanently UTC+03:30 (no DST). */
export const TEHRAN_TZ = 'Asia/Tehran'
export const TEHRAN_OFFSET_MINUTES = 210

export type ClockGateMode = 'offline' | 'clock' | null
export type ClockGateReason = 'timezone' | 'skew' | ''

export type ClockCheckResult = {
  ok: boolean
  blocked: boolean
  mode: ClockGateMode
  skewMs: number
  maxSkewMs: number
  skewMinutes: number | null
  localTimeMs: number
  trustedTimeMs: number | null
  clientDisplay: string
  serverDisplay: string
  clientTimezone: string
  requiredTimezone: string
  timezoneOk: boolean
  clockReason: ClockGateReason
  error?: string
}

export function detectClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function isAsiaTehranTimezone(timeZone: string): boolean {
  if (!timeZone) return false
  const normalized = timeZone.trim()
  return (
    normalized === TEHRAN_TZ ||
    normalized.toLowerCase() === 'asia/tehran' ||
    normalized === 'Iran' ||
    normalized === 'IR'
  )
}

export function isTehranUtcOffset(now = new Date()): boolean {
  return now.getTimezoneOffset() === -TEHRAN_OFFSET_MINUTES
}

export function clientTimezoneIsValid(timeZone: string, now = new Date()): boolean {
  return isAsiaTehranTimezone(timeZone) && isTehranUtcOffset(now)
}

export function formatInZone(ms: number, timeZone?: string): string {
  try {
    return new Date(ms).toLocaleString('fa-IR', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return new Date(ms).toISOString()
  }
}

/**
 * Wall-clock difference between PC local time and Asia/Tehran for the same instant.
 * Catches a wrong Windows timezone even when Date.now() UTC is still correct.
 */
export function wallClockSkewMs(ms: number, clientTimezone: string): number {
  try {
    const formatter = (timeZone?: string) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

    const partsOf = (timeZone?: string) => {
      const parts = formatter(timeZone).formatToParts(new Date(ms))
      const map: Record<string, string> = {}
      for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value
      }
      const hourRaw = Number(map.hour)
      const hour = hourRaw === 24 ? 0 : hourRaw
      return Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        hour,
        Number(map.minute),
        Number(map.second)
      )
    }

    const localAsUtc = partsOf(clientTimezone || undefined)
    const tehranAsUtc = partsOf(TEHRAN_TZ)
    return Math.abs(localAsUtc - tehranAsUtc)
  } catch {
    return 0
  }
}

export function parseServerTimePayload(
  payload: unknown
): { serverMs: number; timezone: string; datetime: string | null } | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root

  const timezone =
    (typeof data.timezone === 'string' && data.timezone) || TEHRAN_TZ
  const datetime =
    typeof data.datetime === 'string' && data.datetime ? data.datetime : null

  if (typeof data.epoch_ms === 'number' && Number.isFinite(data.epoch_ms)) {
    return { serverMs: data.epoch_ms, timezone, datetime }
  }

  if (typeof data.unix === 'number' && Number.isFinite(data.unix)) {
    return { serverMs: data.unix * 1000, timezone, datetime }
  }

  if (datetime) {
    const parsed = Date.parse(datetime)
    if (!Number.isNaN(parsed)) {
      return { serverMs: parsed, timezone, datetime }
    }
  }

  return null
}

export function offlineClockResult(
  clientMs: number,
  clientTimezone: string,
  error = 'offline'
): ClockCheckResult {
  return {
    ok: false,
    blocked: true,
    mode: 'offline',
    skewMs: 0,
    maxSkewMs: CLOCK_MAX_SKEW_MS,
    skewMinutes: null,
    localTimeMs: clientMs,
    trustedTimeMs: null,
    clientDisplay: formatInZone(clientMs, clientTimezone || undefined),
    serverDisplay: '',
    clientTimezone: clientTimezone || '—',
    requiredTimezone: TEHRAN_TZ,
    timezoneOk: clientTimezoneIsValid(clientTimezone),
    clockReason: '',
    error,
  }
}

export function evaluateClockGate(
  clientMs: number,
  serverMs: number,
  clientTimezone: string
): ClockCheckResult {
  const timezoneOk = clientTimezoneIsValid(clientTimezone)
  const absoluteSkewMs = Math.abs(clientMs - serverMs)
  const displaySkewMs = wallClockSkewMs(clientMs, clientTimezone)
  const effectiveSkewMs = Math.max(absoluteSkewMs, displaySkewMs)
  const clockWrong = !timezoneOk || effectiveSkewMs > CLOCK_MAX_SKEW_MS

  let clockReason: ClockGateReason = ''
  if (!timezoneOk || displaySkewMs > CLOCK_MAX_SKEW_MS) {
    clockReason = 'timezone'
  } else if (absoluteSkewMs > CLOCK_MAX_SKEW_MS) {
    clockReason = 'skew'
  }

  return {
    ok: !clockWrong,
    blocked: clockWrong,
    mode: clockWrong ? 'clock' : null,
    skewMs: effectiveSkewMs,
    maxSkewMs: CLOCK_MAX_SKEW_MS,
    skewMinutes: Math.round(effectiveSkewMs / 60000),
    localTimeMs: clientMs,
    trustedTimeMs: serverMs,
    clientDisplay: formatInZone(clientMs, clientTimezone || undefined),
    serverDisplay: formatInZone(serverMs, TEHRAN_TZ),
    clientTimezone: clientTimezone || 'نامشخص',
    requiredTimezone: TEHRAN_TZ,
    timezoneOk,
    clockReason,
  }
}
