import { TEHRAN_OFFSET_MINUTES, TEHRAN_TZ } from './clockGate'

export type ShiftRuleInput = {
  shift_slot_rule?: number
  order_shift?: number
  shiftSlotRule?: number
  orderShift?: number
}

export type ShiftTime = {
  start: string
  end: string
  crossesMidnight: boolean
}

export type ShiftWindow = ShiftTime & {
  startAt: Date
  endAt: Date
  startHour: number
  endHour: number
  /** Duration in hours (8 / 12 / 16 / 24) */
  durationHours: number
}

/** Hours from midnight of the shift's base day (08:00 Asia/Tehran base system). */
const SHIFT_RULES: Record<number, Array<{ start: number; end: number }>> = {
  // 3 × 8 hours
  1: [
    { start: 8, end: 16 },
    { start: 16, end: 24 },
    { start: 24, end: 32 },
  ],
  // 8h + 16h
  2: [
    { start: 8, end: 16 },
    { start: 16, end: 32 },
  ],
  // 2 × 12h
  3: [
    { start: 8, end: 20 },
    { start: 20, end: 32 },
  ],
  // 24h
  4: [{ start: 8, end: 32 }],
}

function resolveRuleKeys(input: ShiftRuleInput): {
  shiftSlotRule: number
  orderShift: number
} | null {
  const shiftSlotRule = Number(input.shift_slot_rule ?? input.shiftSlotRule)
  const orderShift = Number(input.order_shift ?? input.orderShift)
  if (!Number.isFinite(shiftSlotRule) || !Number.isFinite(orderShift)) return null
  return { shiftSlotRule, orderShift }
}

function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  return `${String(h).padStart(2, '0')}:00`
}

function tehranParts(date: Date): {
  year: number
  month: number
  day: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

/** Instant of a Tehran wall-clock Y-M-D 00:00 (fixed UTC+03:30, no DST). */
function tehranWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, 0, 0) - TEHRAN_OFFSET_MINUTES * 60 * 1000
  )
}

function startOfTehranDay(date: Date): Date {
  const { year, month, day } = tehranParts(date)
  return tehranWallToUtc(year, month, day, 0)
}

function atHourFromTehranBaseDay(baseDay: Date, hourValue: number): Date {
  const start = startOfTehranDay(baseDay)
  return new Date(start.getTime() + hourValue * 60 * 60 * 1000)
}

/**
 * Resolve clock range for a shift slot rule + order.
 * Returns null for invalid combinations.
 */
export function getShiftTime(input: ShiftRuleInput): ShiftTime | null {
  const keys = resolveRuleKeys(input)
  if (!keys) return null

  const shift = SHIFT_RULES[keys.shiftSlotRule]?.[keys.orderShift - 1]
  if (!shift) return null

  return {
    start: formatClock(shift.start),
    end: formatClock(shift.end),
    crossesMidnight: shift.end >= 24,
  }
}

/** Absolute start/end Date for a shift on a given Asia/Tehran calendar day. */
export function getShiftWindow(
  input: ShiftRuleInput,
  baseDay: Date = new Date()
): ShiftWindow | null {
  const keys = resolveRuleKeys(input)
  if (!keys) return null

  const shift = SHIFT_RULES[keys.shiftSlotRule]?.[keys.orderShift - 1]
  if (!shift) return null

  const startAt = atHourFromTehranBaseDay(baseDay, shift.start)
  const endAt = atHourFromTehranBaseDay(baseDay, shift.end)

  return {
    start: formatClock(shift.start),
    end: formatClock(shift.end),
    crossesMidnight: shift.end >= 24,
    startHour: shift.start,
    endHour: shift.end,
    durationHours: shift.end - shift.start,
    startAt,
    endAt,
  }
}

/** Whether `now` falls inside this shift (checks today and yesterday Tehran base days). */
export function isOnShiftNow(
  input: ShiftRuleInput,
  now: Date = new Date()
): boolean {
  const today = startOfTehranDay(now)
  for (const dayOffset of [0, -1]) {
    const base = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const window = getShiftWindow(input, base)
    if (window && now >= window.startAt && now < window.endAt) {
      return true
    }
  }
  return false
}

/** Active window for display: prefer the window that contains now, else today's Tehran base. */
export function resolveCurrentShiftWindow(
  input: ShiftRuleInput,
  now: Date = new Date()
): ShiftWindow | null {
  const today = startOfTehranDay(now)
  for (const dayOffset of [0, -1]) {
    const base = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const window = getShiftWindow(input, base)
    if (window && now >= window.startAt && now < window.endAt) {
      return window
    }
  }
  return getShiftWindow(input, today)
}

export function formatShiftHourLabel(time: ShiftTime): string {
  return `${time.start}-${time.end}`
}

export function getShiftDurationHours(window: ShiftWindow): number {
  return window.durationHours
}
