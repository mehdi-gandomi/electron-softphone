import { getBuildAuthConfig } from '../../shared/buildConfig'
import type { UserProfile } from '../../shared/types'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getMockUser() {
  return getBuildAuthConfig().mockUser
}

function getConflictInfo() {
  return getBuildAuthConfig().conflict
}

let remoteSessionActive = getConflictInfo().enabled

function profileFromMock(): UserProfile {
  const user = getMockUser()
  return {
    nationalCode: user.nationalCode,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    shiftHour: user.shiftHour,
    startDateTime: user.startDateTime,
    endDateTime: user.endDateTime,
    position: user.position,
  }
}

export async function qualifyNationalCode(nationalCode: string): Promise<{
  success: boolean
  profile?: UserProfile
  error?: string
}> {
  await sleep(450)
  const user = getMockUser()
  if (nationalCode.trim() !== user.nationalCode) {
    return { success: false, error: 'invalid_national_code' }
  }
  return { success: true, profile: profileFromMock() }
}

export async function loginWithPassword(
  nationalCode: string,
  password: string
): Promise<{
  success: boolean
  profile?: UserProfile
  error?: string
  conflict?: {
    pcName: string
    ipAddress: string
    location: string
    lastSeen: string
  }
}> {
  await sleep(550)
  const user = getMockUser()
  const conflict = getConflictInfo()
  if (nationalCode.trim() !== user.nationalCode) {
    return { success: false, error: 'invalid_national_code' }
  }
  if (password !== user.password) {
    return { success: false, error: 'invalid_password' }
  }
  if (remoteSessionActive) {
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
  return { success: true, profile: profileFromMock() }
}

export async function logoutOtherSession(_nationalCode: string): Promise<{
  success: boolean
}> {
  await sleep(500)
  remoteSessionActive = false
  return { success: true }
}
