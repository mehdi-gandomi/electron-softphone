import { getBuildMockExtensions } from '../../shared/buildConfig'
import { normalizeNationalCode } from '../../shared/nationalCode'
import type { ExtensionInfo } from '../../shared/types'

type ApiExtensionStatusItem = {
  extension: string
  status: 'free' | 'used' | string
  national_code?: string | null
}

type ApiEnvelope = {
  status?: 'success' | 'error'
  message?: string
  data?: unknown
  errors?: Record<string, string[]>
}

function extractApiMessage(payload: ApiEnvelope | null, fallback: string): string {
  if (!payload) return fallback
  if (payload.message) return payload.message
  const firstFieldError = payload.errors
    ? Object.values(payload.errors).flat()[0]
    : undefined
  return firstFieldError || fallback
}

type ReserveData = {
  reservation_id?: number
  province_id?: number
  extension?: string
  national_code?: string
  reserved_at?: string
  ip?: string | null
  username?: string | null
  password?: string | null
}

const SIP_CREDENTIALS_INCOMPLETE =
  'داخلی رزرو شد اما اطلاعات SIP ناقص است (ip یا password خالی است)'

function enrichExtensionStatusItem(
  extension: string,
  provinceTitle: string,
  provinceId: number,
  statusItem: ApiExtensionStatusItem
): ExtensionInfo {
  const catalog = getBuildMockExtensions()
  const match =
    catalog.find((item) => item.extension === extension) ||
    catalog.find((item) => item.province === provinceTitle)

  const busy = statusItem.status === 'used'
  return {
    id: `ext-${extension}`,
    label: `${provinceTitle || 'استان'} - ${extension}`,
    province: provinceTitle || match?.province || '',
    provinceId,
    extension,
    // SIP credentials come only from reserve response — never invent here
    host: '',
    password: '',
    displayName: extension,
    registeredElsewhere: busy,
    occupiedByNationalCode: statusItem.national_code
      ? normalizeNationalCode(statusItem.national_code)
      : null,
  }
}

export async function fetchExtensionsStatus(
  provinceId: number,
  provinceTitle: string
): Promise<{ success: true; items: ExtensionInfo[] } | { success: false; error: string }> {
  if (!provinceId || provinceId < 1) {
    return { success: false, error: 'شناسه استان نامعتبر است' }
  }

  const response = await window.api.extensions.status(provinceId)
  if (response.error && response.status === 0) {
    return { success: false, error: response.error }
  }

  const payload = (response.json || null) as ApiEnvelope | null
  if (import.meta.env.DEV) {
    console.log('[extensions/status]', {
      provinceId,
      status: response.status,
      body: payload,
    })
  }

  if (!response.ok || payload?.status === 'error') {
    return {
      success: false,
      error: payload?.message || 'خطا در دریافت لیست داخلی‌ها',
    }
  }

  const rows = Array.isArray(payload?.data) ? (payload!.data as ApiExtensionStatusItem[]) : []
  const items = rows
    .filter((row) => row && row.extension)
    .map((row) =>
      enrichExtensionStatusItem(String(row.extension), provinceTitle, provinceId, row)
    )

  return { success: true, items }
}

export async function reserveExtension(input: {
  provinceId: number
  nationalCode: string
  extension: string
}): Promise<
  | {
      success: true
      reservationId?: number
      provinceId?: number
      extension: string
      reservedAt?: string
      ip: string
      username: string
      password: string
      message?: string
    }
  | { success: false; error: string }
> {
  const response = await window.api.extensions.reserve({
    provinceId: input.provinceId,
    nationalCode: normalizeNationalCode(input.nationalCode),
    extension: String(input.extension).trim(),
  })

  if (response.error && response.status === 0) {
    return { success: false, error: response.error }
  }

  const payload = (response.json || null) as ApiEnvelope | null
  if (import.meta.env.DEV) {
    console.log('[extensions/reserve]', {
      status: response.status,
      body: payload,
    })
  }

  if (!response.ok || payload?.status !== 'success') {
    return {
      success: false,
      error: extractApiMessage(payload, 'خطا در ثبت داخلی'),
    }
  }

  const data = (payload.data || {}) as ReserveData
  const extension = String(data.extension || input.extension || '').trim()
  const ip = String(data.ip || '').trim()
  // Server may omit username; fall back to extension number only
  const username = String(data.username || '').trim() || extension
  // password may be null from API — keep empty string (do not invent a secret)
  const password = data.password == null ? '' : String(data.password).trim()

  if (!ip || !username) {
    // Reservation may already exist server-side — release so the line is not stuck.
    try {
      await logoutExtension({
        nationalCode: normalizeNationalCode(input.nationalCode),
        extension,
        provinceId: data.province_id || input.provinceId,
      })
    } catch {
      // Ignore release failure; still surface incomplete credentials.
    }
    return { success: false, error: SIP_CREDENTIALS_INCOMPLETE }
  }

  if (!password && import.meta.env.DEV) {
    console.warn('[extensions/reserve] password is empty; SIP register may fail')
  }

  return {
    success: true,
    reservationId: data.reservation_id,
    provinceId: data.province_id,
    extension,
    reservedAt: data.reserved_at,
    ip,
    username,
    password,
    message: payload.message,
  }
}

export async function logoutExtension(input: {
  nationalCode: string
  extension: string
  provinceId?: number
}): Promise<{ success: boolean; alreadyReleased?: boolean; error?: string; message?: string }> {
  const response = await window.api.extensions.logout({
    nationalCode: normalizeNationalCode(input.nationalCode),
    extension: String(input.extension).trim(),
    provinceId: input.provinceId,
  })

  if (response.error && response.status === 0) {
    return { success: false, error: response.error }
  }

  const payload = (response.json || null) as ApiEnvelope | null
  if (import.meta.env.DEV) {
    console.log('[extensions/logout]', {
      status: response.status,
      body: payload,
    })
  }

  if (!response.ok || payload?.status === 'error') {
    const message = extractApiMessage(payload, 'خطا در آزادسازی داخلی')
    // Already released / not found → treat as cleared locally
    if (message.includes('یافت نشد')) {
      return { success: true, alreadyReleased: true, message }
    }
    return { success: false, error: message }
  }

  return { success: true, message: payload?.message }
}
