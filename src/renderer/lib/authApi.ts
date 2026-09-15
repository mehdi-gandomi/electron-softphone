import type { AuthSession, ShiftAssignment, UserProfile } from '../../shared/types'
import { normalizeNationalCode } from '../../shared/nationalCode'
import {
  formatShiftDurationLabelFa,
  formatShiftMoment,
} from './persianDate'
import { getShiftWindow } from '../../shared/shiftTime'
import { mapShiftItems } from './shiftInfoApi'

export type ShiftAccessInfo = {
  allowed: boolean
  isWithinShift: boolean
  reason: string
  shiftStart?: string
  shiftEnd?: string
}

type EmdadPhoneSsoUser = {
  id?: number
  name?: string
  username?: string
  email?: string | null
  mobile?: string | null
  avatar_url?: string | null
}

type EmdadPhoneMember = {
  id?: number
  national_code?: string
  full_name?: string
  relief_level?: string | null
  avatar_url?: string | null
}

/** Login `data.shift` / shift-info `data.user` — member shift summary. */
type EmdadPhoneShiftSummary = {
  has_shift?: boolean
  hasShift?: boolean
  nationalCode?: string
  firstName?: string
  lastName?: string
  imageUrl?: string
  shiftHour?: string
  startDateTime?: string
  endDateTime?: string
  province_id?: number
  province_title?: string
  branch_id?: number
  branch_title?: string
  personnel_id?: number
  member_id?: number
  post_id?: number
  post_title_id?: number
  post_title?: string
  operational_center_id?: number
  shift_slot_rule?: number
  order_shift?: number
}

type EmdadPhoneShiftAccess = {
  allowed?: boolean
  isWithinShift?: boolean
  reason?: string
  shiftStart?: string | null
  shiftEnd?: string | null
}

type AuthLoginData = {
  token?: string
  token_type?: string
  user?: EmdadPhoneSsoUser
  member?: EmdadPhoneMember
  shift?: EmdadPhoneShiftSummary | null
  shift_access?: EmdadPhoneShiftAccess
  has_shift?: boolean
  shifts?: unknown[]
  /** @deprecated login nested shifts here; current API uses `shifts` */
  data?: unknown[]
  post_titles?: Record<string, string> | string[]
}

type AuthLoginSuccessResponse = {
  result: number
  data: AuthLoginData
  message?: string
}

type AuthLoginErrorResponse = {
  result?: number
  error_code?: string
  error?: string
  message?: string
  errors?: Record<string, string[]>
  data?: AuthLoginData
}

export type AuthLoginResult =
  | {
      success: true
      session: AuthSession
      profile: UserProfile
      shiftAccess: ShiftAccessInfo | null
      hasShift: boolean
      shifts: ShiftAssignment[]
    }
  | {
      success: false
      error: string
      errorCode?: string
      profile?: UserProfile
      shiftAccess?: ShiftAccessInfo | null
    }

function parseDateTime(value?: string | null): Date | null {
  if (!value) return null
  const normalized = value.trim().replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDisplayMoment(value?: string | null, reference?: string | null): string {
  const date = parseDateTime(value)
  if (!date) return value || ''
  const ref = parseDateTime(reference) || date
  return formatShiftMoment(date, ref)
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function mapShiftAccess(raw?: EmdadPhoneShiftAccess | null): ShiftAccessInfo | null {
  if (!raw) return null
  return {
    allowed: Boolean(raw.allowed),
    isWithinShift: Boolean(raw.isWithinShift),
    reason: raw.reason || '',
    shiftStart: raw.shiftStart || undefined,
    shiftEnd: raw.shiftEnd || undefined,
  }
}

function enrichShiftLabels(shift: EmdadPhoneShiftSummary): Pick<
  UserProfile,
  'shiftHour' | 'startDateTime' | 'endDateTime'
> {
  const startRaw = shift.startDateTime
  const endRaw = shift.endDateTime
  if (startRaw || endRaw) {
    let durationLabel = shift.shiftHour || ''
    const startAt = parseDateTime(startRaw)
    const endAt = parseDateTime(endRaw)
    if (startAt && endAt) {
      const hours = Math.round((endAt.getTime() - startAt.getTime()) / 3600000)
      if (hours > 0) durationLabel = formatShiftDurationLabelFa(hours)
    }
    return {
      shiftHour: durationLabel,
      startDateTime: formatDisplayMoment(startRaw, startRaw),
      endDateTime: formatDisplayMoment(endRaw, startRaw),
    }
  }

  if (shift.shift_slot_rule && shift.order_shift) {
    const window = getShiftWindow({
      shift_slot_rule: shift.shift_slot_rule,
      order_shift: shift.order_shift,
    })
    if (window) {
      return {
        shiftHour: formatShiftDurationLabelFa(window.durationHours),
        startDateTime: formatShiftMoment(window.startAt, window.startAt),
        endDateTime: formatShiftMoment(window.endAt, window.startAt),
      }
    }
  }

  return {
    shiftHour: shift.shiftHour || '',
    startDateTime: shift.startDateTime || '',
    endDateTime: shift.endDateTime || '',
  }
}

function mapProfileFromLoginData(
  data: AuthLoginData | undefined,
  existing?: UserProfile | null
): UserProfile {
  const member = data?.member
  const shift = data?.shift || {}
  const sso = data?.user
  const namesFromMember = splitFullName(member?.full_name || '')
  const labels = enrichShiftLabels(shift)
  const nationalCode = normalizeNationalCode(
    member?.national_code ||
      shift.nationalCode ||
      sso?.username ||
      existing?.nationalCode ||
      ''
  )

  return {
    nationalCode,
    firstName: shift.firstName || namesFromMember.firstName || existing?.firstName || '',
    lastName: shift.lastName || namesFromMember.lastName || existing?.lastName || '',
    imageUrl: shift.imageUrl || member?.avatar_url || existing?.imageUrl || '',
    shiftHour: labels.shiftHour || existing?.shiftHour || '',
    startDateTime: labels.startDateTime || existing?.startDateTime || '',
    endDateTime: labels.endDateTime || existing?.endDateTime || '',
    position: shift.post_title || member?.relief_level || existing?.position || '',
    provinceId: shift.province_id ?? existing?.provinceId,
    provinceTitle: shift.province_title || existing?.provinceTitle,
    branchId: shift.branch_id ?? existing?.branchId,
    branchTitle: shift.branch_title || existing?.branchTitle,
    memberId: member?.id ?? shift.member_id ?? existing?.memberId,
    postId: shift.post_id ?? existing?.postId,
    postTitleId: shift.post_title_id ?? existing?.postTitleId,
    operationalCenterId: shift.operational_center_id ?? existing?.operationalCenterId,
  }
}

function mapAuthSession(payload: AuthLoginSuccessResponse, profile: UserProfile): AuthSession {
  const sso = payload.data.user || {}
  const member = payload.data.member || {}
  const fullName =
    member.full_name ||
    `${profile.firstName} ${profile.lastName}`.trim() ||
    sso.name ||
    ''

  return {
    token: payload.data.token || '',
    tokenType: payload.data.token_type || 'Bearer',
    message: payload.message || '',
    user: {
      id: sso.id || 0,
      name: sso.name || fullName,
      username: sso.username || profile.nationalCode,
      email: sso.email ?? null,
      mobile: sso.mobile ?? null,
      avatarUrl: sso.avatar_url || profile.imageUrl || null,
    },
    member: {
      id: member.id || profile.memberId || 0,
      nationalCode: normalizeNationalCode(member.national_code || profile.nationalCode),
      fullName,
      reliefLevel: member.relief_level || profile.position || null,
      avatarUrl: member.avatar_url || profile.imageUrl || null,
    },
    loggedInAt: new Date().toISOString(),
  }
}

function extractLoginError(payload: AuthLoginErrorResponse | null): string {
  if (!payload) return 'خطا در ورود'
  if (payload.error) return payload.error
  if (payload.message) return payload.message
  const firstFieldError = payload.errors
    ? Object.values(payload.errors).flat()[0]
    : undefined
  if (firstFieldError) return firstFieldError
  if (payload.error_code === 'RATE_LIMITED') {
    return 'تعداد تلاش بیش از حد مجاز است. کمی بعد دوباره تلاش کنید'
  }
  if (payload.error_code === 'INVALID_CREDENTIALS') {
    return 'نام کاربری یا رمز عبور اشتباه است'
  }
  if (payload.error_code === 'MEMBER_NOT_FOUND') {
    return 'عضو با این کدملی یافت نشد'
  }
  if (payload.error_code === 'OUTSIDE_SHIFT_HOURS') {
    return 'الان خارج از ساعت شیفت شماست'
  }
  if (payload.error_code === 'SHIFT_LOOKUP_FAILED') {
    return 'بارگذاری شیفت امروز ناموفق بود'
  }
  return 'خطا در ورود'
}

export async function loginWithNationalCode(
  nationalCode: string,
  password: string,
  existingProfile?: UserProfile | null
): Promise<AuthLoginResult> {
  const username = normalizeNationalCode(nationalCode)
  const response = await window.api.auth.login(username, password)

  if (response.error && response.status === 0) {
    return { success: false, error: response.error }
  }

  const payload = (response.json || null) as AuthLoginSuccessResponse | AuthLoginErrorResponse | null

  if (import.meta.env.DEV) {
    console.log('[auth/login]', {
      status: response.status,
      ok: response.ok,
      body: payload,
    })
  }

  if (!response.ok || (payload && 'result' in payload && payload.result === -1)) {
    const errorPayload = payload as AuthLoginErrorResponse | null
    const errorData = errorPayload?.data
    return {
      success: false,
      error: extractLoginError(errorPayload),
      errorCode: errorPayload?.error_code,
      profile: errorData?.member || errorData?.shift
        ? mapProfileFromLoginData(errorData, existingProfile)
        : existingProfile || undefined,
      shiftAccess: mapShiftAccess(errorData?.shift_access),
    }
  }

  const successPayload = payload as AuthLoginSuccessResponse | null
  if (
    !successPayload ||
    successPayload.result !== 1 ||
    !successPayload.data?.token ||
    !successPayload.data.member
  ) {
    return { success: false, error: 'پاسخ ورود نامعتبر است' }
  }

  const profile = mapProfileFromLoginData(successPayload.data, existingProfile)
  const hasShift = Boolean(
    successPayload.data.has_shift ??
      successPayload.data.shift?.has_shift ??
      successPayload.data.shift?.hasShift
  )
  const shifts = mapShiftItems(successPayload.data.shifts ?? successPayload.data.data)

  return {
    success: true,
    session: mapAuthSession(successPayload, profile),
    profile,
    shiftAccess: mapShiftAccess(successPayload.data.shift_access),
    hasShift,
    shifts,
  }
}
