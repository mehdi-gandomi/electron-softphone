import { useCallback, useEffect, useState } from 'react'
import type { UpdaterStatus } from '../../shared/types'

export const emptyUpdaterStatus: UpdaterStatus = {
  currentVersion: '',
  latestVersion: null,
  releaseNotes: '',
  releaseUrl: '',
  state: 'idle',
  progress: 0,
  error: null,
  canInstall: false,
  packaged: false,
  portable: false,
}

export function hasNewerRelease(status: UpdaterStatus): boolean {
  const current = String(status.currentVersion || '').trim()
  const latest = String(status.latestVersion || '').trim()
  if (!current || !latest) return false
  return latest.replace(/^v/i, '') !== current.replace(/^v/i, '') &&
    (status.state === 'available' ||
      status.state === 'ready' ||
      status.state === 'downloading')
}

export function useUpdater(options?: { checkOnMount?: boolean }) {
  const checkOnMount = options?.checkOnMount === true
  const [status, setStatus] = useState<UpdaterStatus>(emptyUpdaterStatus)

  useEffect(() => {
    let cancelled = false
    const apply = (next: UpdaterStatus) => {
      if (!cancelled) setStatus(next)
    }

    window.api.updater.status().then(apply).catch(() => {})
    if (checkOnMount) {
      window.api.updater.check().then(apply).catch(() => {})
    }

    const stop = window.api.updater.onStatus(apply)
    return () => {
      cancelled = true
      stop()
    }
  }, [checkOnMount])

  const check = useCallback(async () => {
    const next = await window.api.updater.check()
    setStatus(next)
    return next
  }, [])

  const download = useCallback(async () => {
    const next = await window.api.updater.download()
    setStatus(next)
    return next
  }, [])

  const install = useCallback(async () => {
    const result = await window.api.updater.install()
    if (!result.success && result.error) {
      setStatus((prev) => ({ ...prev, state: 'error', error: result.error || prev.error }))
    }
    return result
  }, [])

  return { status, setStatus, check, download, install }
}
