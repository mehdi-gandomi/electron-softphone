import { app } from 'electron'
import { normalizeNationalCode } from '../shared/nationalCode'

export type RemoteApiResponse = {
  ok: boolean
  status: number
  json: unknown | null
  error?: string
}

function getApiBaseUrl(): string {
  const fromVite =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_AUTH_API_BASE_URL as string | undefined)
      : undefined
  const fromProcess = process.env.VITE_AUTH_API_BASE_URL
  return String(fromVite || fromProcess || '').replace(/\/+$/, '')
}

async function remoteJsonRequest(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    body?: Record<string, unknown>
    query?: Record<string, string | number | undefined>
    extraHeaders?: Record<string, string>
    cache?: RequestCache
  }
): Promise<RemoteApiResponse> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) {
    return { ok: false, status: 0, json: null, error: 'آدرس API تنظیم نشده است' }
  }

  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      cache: options?.cache,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...options?.extraHeaders,
      },
      body: method === 'POST' ? JSON.stringify(options?.body || {}) : undefined,
    })

    let json: unknown | null = null
    try {
      json = await response.json()
    } catch {
      json = null
    }

    if (!app.isPackaged) {
      console.log('[remote-api]', {
        method,
        url: url.toString(),
        status: response.status,
        ok: response.ok,
        body: json,
      })
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
    }
  } catch (err: unknown) {
    if (!app.isPackaged) {
      console.error('[remote-api] request failed', url.toString(), err)
    }
    return {
      ok: false,
      status: 0,
      json: null,
      error: 'ارتباط با سرور برقرار نشد',
    }
  }
}

export function remoteJsonPost(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<RemoteApiResponse> {
  return remoteJsonRequest('POST', path, { body, extraHeaders })
}

export function remoteJsonGet(
  path: string,
  query?: Record<string, string | number | undefined>,
  extraHeaders?: Record<string, string>
): Promise<RemoteApiResponse> {
  return remoteJsonRequest('GET', path, { query, extraHeaders })
}

/** Public clock probe — no auth, no CSRF. */
export function getEmdadServerTime(): Promise<RemoteApiResponse> {
  return remoteJsonRequest('GET', '/ecrc/api/emdad-phone/server-time', {
    cache: 'no-store',
    extraHeaders: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  })
}

export function postShiftInfo(nationalCode: string): Promise<RemoteApiResponse> {
  return remoteJsonPost('/ecrc/api/emdad-phone/shift-info', {
    national_code: normalizeNationalCode(nationalCode),
  })
}

export function postAuthLogin(username: string, password: string): Promise<RemoteApiResponse> {
  return remoteJsonPost('/ecrc/api/emdad-phone/login', {
    username: normalizeNationalCode(username),
    password,
  })
}

export function getExtensionsStatus(provinceId: number): Promise<RemoteApiResponse> {
  return remoteJsonGet('/ecrc/api/emdad-phone/extensions/status', {
    province_id: provinceId,
  })
}

export function postReserveExtension(input: {
  provinceId: number
  nationalCode: string
  extension: string
}): Promise<RemoteApiResponse> {
  return remoteJsonPost('/ecrc/api/emdad-phone/extensions/reserve', {
    province_id: input.provinceId,
    national_code: normalizeNationalCode(input.nationalCode),
    extension: String(input.extension).trim(),
  })
}

export function postLogoutExtension(input: {
  nationalCode: string
  extension: string
  provinceId?: number
}): Promise<RemoteApiResponse> {
  const body: Record<string, unknown> = {
    national_code: normalizeNationalCode(input.nationalCode),
    extension: String(input.extension).trim(),
  }
  if (typeof input.provinceId === 'number' && input.provinceId > 0) {
    body.province_id = input.provinceId
  }
  return remoteJsonPost('/ecrc/api/emdad-phone/logout-extension', body)
}
