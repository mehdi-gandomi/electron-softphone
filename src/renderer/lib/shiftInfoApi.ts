import type { ShiftAssignment, UserProfile } from '../../shared/types'
import { normalizeNationalCode } from '../../shared/nationalCode'
import {
  getShiftDurationHours,
  isOnShiftNow,
  resolveCurrentShiftWindow,
} from '../../shared/shiftTime'
import {
  formatShiftDurationLabelFa,
  formatShiftMoment,
} from './persianDate'

type ShiftInfoApiShift = {
  personnel_id?: number
  member_id?: number
  post_id?: number
  post_title_id?: number
  post_title?: string
  operational_center_id?: number
  shift_time?: number
  order?: number
  type_day?: number
  order_shift?: number
  shift_slot_rule?: number
  shift_kind?: number
}

type ShiftInfoApiUser = {
  nationalCode: string
  firstName: string
  lastName: string
  imageUrl?: string
  shiftHour?: string
  startDateTime?: string
  endDateTime?: string
  province_id?: number
  province_title?: string
  branch_id?: number
  branch_title?: string
  member_id?: number
  post_id?: number
  post_title?: string
  post_title_id?: number
  operational_center_id?: number
}

type ShiftInfoSuccessResponse = {
  status: 'success'
  data: {
    result: number
    has_shift: boolean
    user?: ShiftInfoApiUser
    /** @deprecated Prefer `user` */
    mockUser?: ShiftInfoApiUser
    /** Shift items — current API uses `data`; login-shaped `shifts` is accepted as fallback. */
    data?: ShiftInfoApiShift[]
    shifts?: ShiftInfoApiShift[]
    post_titles: Record<string, string> | string[]
  }
}

type ShiftInfoErrorResponse = {
  status?: 'error'
  message?: string
  data?: {
    result?: number
    error?: string
  }
  errors?: {
    national_code?: string[]
  }
}

export type ShiftInfoLookupResult =
  | {
      success: true
      hasShift: boolean
      isOnShift: boolean
      profile: UserProfile
      shifts: ShiftAssignment[]
      postTitles: Record<string, string> | string[]
    }
  | {
      success: false
      error: string
    }

function mapUserProfile(apiUser: ShiftInfoApiUser, firstShift?: ShiftInfoApiShift): UserProfile {
  return {
    nationalCode: normalizeNationalCode(apiUser.nationalCode || ''),
    firstName: apiUser.firstName || '',
    lastName: apiUser.lastName || '',
    imageUrl: apiUser.imageUrl || '',
    shiftHour: apiUser.shiftHour || '',
    startDateTime: apiUser.startDateTime || '',
    endDateTime: apiUser.endDateTime || '',
    position: apiUser.post_title || firstShift?.post_title || '',
    provinceId: apiUser.province_id,
    provinceTitle: apiUser.province_title,
    branchId: apiUser.branch_id,
    branchTitle: apiUser.branch_title,
    memberId: apiUser.member_id,
    postId: apiUser.post_id,
    postTitleId: apiUser.post_title_id,
    operationalCenterId: apiUser.operational_center_id,
  }
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function mapShiftAssignment(shift: ShiftInfoApiShift): ShiftAssignment {
  return {
    personnelId: asNumber(shift.personnel_id),
    memberId: asNumber(shift.member_id),
    postId: asNumber(shift.post_id),
    postTitleId: asNumber(shift.post_title_id),
    postTitle: shift.post_title || '',
    operationalCenterId: asNumber(shift.operational_center_id),
    shiftTime: asNumber(shift.shift_time),
    order: asNumber(shift.order),
    typeDay: asNumber(shift.type_day),
    orderShift: asNumber(shift.order_shift),
    shiftSlotRule: asNumber(shift.shift_slot_rule),
    shiftKind: asNumber(shift.shift_kind),
  }
}

export function mapShiftItems(raw: unknown): ShiftAssignment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => mapShiftAssignment(item as ShiftInfoApiShift))
}

function extractApiError(payload: ShiftInfoErrorResponse | null) {
  return (
    payload?.message ||
    payload?.data?.error ||
    payload?.errors?.national_code?.[0] ||
    'خطا در دریافت اطلاعات شیفت'
  )
}

function applyShiftSchedule(
  profile: UserProfile,
  shifts: ShiftAssignment[],
  now = new Date()
): { profile: UserProfile; isOnShift: boolean } {
  if (shifts.length === 0) {
    return { profile, isOnShift: false }
  }

  const active =
    shifts.find((shift) =>
      isOnShiftNow(
        {
          shiftSlotRule: shift.shiftSlotRule,
          orderShift: shift.orderShift,
        },
        now
      )
    ) || null
  const primary = active || shifts[0]
  const window = resolveCurrentShiftWindow(
    {
      shiftSlotRule: primary.shiftSlotRule,
      orderShift: primary.orderShift,
    },
    now
  )
  if (!window) {
    return { profile, isOnShift: false }
  }

  return {
    isOnShift: Boolean(active),
    profile: {
      ...profile,
      shiftHour: formatShiftDurationLabelFa(getShiftDurationHours(window)),
      startDateTime: formatShiftMoment(window.startAt, window.startAt),
      endDateTime: formatShiftMoment(window.endAt, window.startAt),
    },
  }
}

export async function fetchShiftInfoByNationalCode(
  nationalCode: string
): Promise<ShiftInfoLookupResult> {
  const response = await window.api.auth.shiftInfo(normalizeNationalCode(nationalCode))

  if (response.error && response.status === 0) {
    return { success: false, error: response.error }
  }

  const payload = (response.json || null) as ShiftInfoSuccessResponse | ShiftInfoErrorResponse | null

  if (import.meta.env.DEV) {
    console.log('[shift-info]', {
      status: response.status,
      ok: response.ok,
      body: payload,
    })
  }

  if (!response.ok) {
    if (!payload && response.status > 0) {
      return { success: false, error: 'خطای سرور' }
    }
    return { success: false, error: extractApiError(payload as ShiftInfoErrorResponse | null) }
  }

  const successPayload = payload as ShiftInfoSuccessResponse | null
  const data = successPayload?.data
  const apiUser = data?.user || data?.mockUser
  if (!successPayload || successPayload.status !== 'success' || !data || !apiUser) {
    return { success: false, error: 'پاسخ API نامعتبر است' }
  }

  const rawShifts = Array.isArray(data.shifts)
    ? data.shifts
    : Array.isArray(data.data)
      ? data.data
      : []
  const shifts = mapShiftItems(rawShifts)
  const hasShift = Boolean(data.has_shift)
  const baseProfile = mapUserProfile(apiUser, rawShifts[0])
  const { profile, isOnShift } = hasShift
    ? applyShiftSchedule(baseProfile, shifts)
    : { profile: baseProfile, isOnShift: false }

  return {
    success: true,
    hasShift,
    isOnShift,
    profile,
    shifts,
    postTitles: data.post_titles,
  }
}
