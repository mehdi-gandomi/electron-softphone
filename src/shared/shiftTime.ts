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

/** Hours from midnight of the shift's base day (08:00 base system). */
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

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function atHourFromBaseDay(baseDay: Date, hourValue: number): Date {
  const d = startOfLocalDay(baseDay)
  d.setHours(hourValue, 0, 0, 0)
  return d
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

/** Absolute start/end Date for a shift on a given base calendar day. */
export function getShiftWindow(
  input: ShiftRuleInput,
  baseDay: Date = new Date()
): ShiftWindow | null {
  const keys = resolveRuleKeys(input)
  if (!keys) return null

  const shift = SHIFT_RULES[keys.shiftSlotRule]?.[keys.orderShift - 1]
  if (!shift) return null

  const startAt = atHourFromBaseDay(baseDay, shift.start)
  const endAt = atHourFromBaseDay(baseDay, shift.end)

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

/** Whether `now` falls inside this shift (checks today and yesterday base days). */
export function isOnShiftNow(
  input: ShiftRuleInput,
  now: Date = new Date()
): boolean {
  for (const dayOffset of [0, -1]) {
    const base = startOfLocalDay(now)
    base.setDate(base.getDate() + dayOffset)
    const window = getShiftWindow(input, base)
    if (window && now >= window.startAt && now < window.endAt) {
      return true
    }
  }
  return false
}

/** Active window for display: prefer the window that contains now, else today's base. */
export function resolveCurrentShiftWindow(
  input: ShiftRuleInput,
  now: Date = new Date()
): ShiftWindow | null {
  for (const dayOffset of [0, -1]) {
    const base = startOfLocalDay(now)
    base.setDate(base.getDate() + dayOffset)
    const window = getShiftWindow(input, base)
    if (window && now >= window.startAt && now < window.endAt) {
      return window
    }
  }
  return getShiftWindow(input, startOfLocalDay(now))
}

export function formatShiftHourLabel(time: ShiftTime): string {
  return `${time.start}-${time.end}`
}

export function getShiftDurationHours(window: ShiftWindow): number {
  return window.durationHours
}
