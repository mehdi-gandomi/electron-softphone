import { getBuildAuthConfig } from '../../shared/buildConfig'
import { nationalCodesEqual, normalizeNationalCode } from '../../shared/nationalCode'
import type { AuthSession, ShiftAssignment, UserProfile } from '../../shared/types'
import { loginWithNationalCode, type ShiftAccessInfo } from './authApi'
import { fetchShiftInfoByNationalCode } from './shiftInfoApi'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getConflictInfo() {
  return getBuildAuthConfig().conflict
}

function isSessionCheckEnabled() {
  return getBuildAuthConfig().sessionCheckEnabled !== false
}

let remoteSessionActive = isSessionCheckEnabled() && getConflictInfo().enabled
let latestQualifiedProfile: UserProfile | null = null

export async function qualifyNationalCode(nationalCode: string): Promise<{
  success: boolean
  profile?: UserProfile
  error?: string
  hasShift?: boolean
  isOnShift?: boolean
  shifts?: ShiftAssignment[]
}> {
  const result = await fetchShiftInfoByNationalCode(normalizeNationalCode(nationalCode))
  if (!result.success) {
    latestQualifiedProfile = null
    return { success: false, error: result.error }
  }

  latestQualifiedProfile = result.profile
  return {
    success: true,
    profile: result.profile,
    hasShift: result.hasShift,
    isOnShift: result.isOnShift,
    shifts: result.shifts,
  }
}

export async function loginWithPassword(
  nationalCode: string,
  password: string
): Promise<{
  success: boolean
  profile?: UserProfile
  session?: AuthSession
  error?: string
  errorCode?: string
  shiftAccess?: ShiftAccessInfo | null
  hasShift?: boolean
  shifts?: ShiftAssignment[]
  conflict?: {
    pcName: string
    ipAddress: string
    location: string
    lastSeen: string
  }
}> {
  const conflict = getConflictInfo()
  if (isSessionCheckEnabled() && remoteSessionActive) {
    return {
      success: false,
      error: 'logged_in_elsewhere',
      conflict: {
        pcName: conflict.pcName,
        ipAddress: conflict.ipAddress,
        location: conflict.location,
        lastSeen: conflict.lastSeen,
      },
    }
  }

  const existingProfile =
    latestQualifiedProfile &&
    nationalCodesEqual(latestQualifiedProfile.nationalCode, nationalCode)
      ? latestQualifiedProfile
      : null

  const result = await loginWithNationalCode(nationalCode, password, existingProfile)
  if (!result.success) {
    if (result.profile) latestQualifiedProfile = result.profile
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      profile: result.profile,
      shiftAccess: result.shiftAccess,
    }
  }

  latestQualifiedProfile = result.profile
  return {
    success: true,
    profile: result.profile,
    session: result.session,
    shiftAccess: result.shiftAccess,
    hasShift: result.hasShift,
    shifts: result.shifts,
  }
}

export async function logoutOtherSession(_nationalCode: string): Promise<{
  success: boolean
}> {
  await sleep(500)
  remoteSessionActive = false
  return { success: true }
}
