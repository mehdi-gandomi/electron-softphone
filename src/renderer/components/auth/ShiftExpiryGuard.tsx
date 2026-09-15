import { useEffect, useRef, useState } from 'react'
import { isOnShiftNow } from '../../../shared/shiftTime'
import { nationalCodesEqual } from '../../../shared/nationalCode'
import { fetchShiftInfoByNationalCode } from '../../lib/shiftInfoApi'
import { useI18n } from '../../lib/i18n'
import type { LatestShiftLookup, UserAccessState } from '../../../shared/types'

function hasActiveShift(lookup: LatestShiftLookup | null): boolean {
  if (!lookup?.hasShift) return false
  const shifts = lookup.shifts || []
  if (shifts.length === 0) {
    // No rule data to evaluate — do not force logout
    return true
  }
  return shifts.some((shift) =>
    isOnShiftNow({
      shiftSlotRule: shift.shiftSlotRule,
      orderShift: shift.orderShift,
    })
  )
}

interface ShiftExpiryGuardProps {
  userAccess: UserAccessState
  intervalMinutes: number
  onForceLogout: () => void | Promise<void>
}

/**
 * While logged in with an assigned shift, periodically compares local time
 * against shift windows. When the shift has ended, shows a popup and logs out.
 */
export function ShiftExpiryGuard({
  userAccess,
  intervalMinutes,
  onForceLogout,
}: ShiftExpiryGuardProps) {
  const { t, isRtl } = useI18n()
  const [showEnded, setShowEnded] = useState(false)
  const armedRef = useRef(false)
  const onForceLogoutRef = useRef(onForceLogout)
  onForceLogoutRef.current = onForceLogout

  useEffect(() => {
    if (userAccess.status !== 'logged_in' || !userAccess.profile) {
      setShowEnded(false)
      armedRef.current = false
      return
    }

    let cancelled = false
    const minutes = Math.max(1, Math.min(1440, Math.floor(intervalMinutes || 10)))
    const periodMs = minutes * 60 * 1000
    const nationalCode = userAccess.profile.nationalCode

    const runCheck = async () => {
      if (cancelled || armedRef.current || !nationalCode) return
      try {
        const settings = (await window.api.settings.get()) as {
          latestShiftLookup?: LatestShiftLookup | null
        }
        let lookup = settings.latestShiftLookup || null

        // Refresh shift rules if missing so expiry can be evaluated
        if (
          nationalCodesEqual(lookup?.nationalCode, nationalCode) &&
          lookup?.hasShift &&
          (!lookup.shifts || lookup.shifts.length === 0)
        ) {
          const refreshed = await fetchShiftInfoByNationalCode(nationalCode)
          if (refreshed.success && refreshed.profile) {
            lookup = {
              nationalCode,
              hasShift: refreshed.hasShift === true,
              isOnShift: refreshed.isOnShift === true,
              profile: refreshed.profile,
              shifts: refreshed.shifts || [],
              fetchedAt: new Date().toISOString(),
            }
            await window.api.settings.set('latestShiftLookup', lookup)
          }
        }

        if (
          !lookup ||
          !nationalCodesEqual(lookup.nationalCode, nationalCode) ||
          !lookup.hasShift
        ) {
          return
        }

        if (hasActiveShift(lookup)) {
          if (lookup.isOnShift !== true) {
            await window.api.settings.set('latestShiftLookup', {
              ...lookup,
              isOnShift: true,
            })
          }
          return
        }

        armedRef.current = true
        await window.api.settings.set('latestShiftLookup', {
          ...lookup,
          isOnShift: false,
        })
        setShowEnded(true)
      } catch {
        // Ignore transient failures
      }
    }

    const initialTimer = setTimeout(() => {
      void runCheck()
    }, 1500)

    const intervalId = setInterval(() => {
      void runCheck()
    }, periodMs)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(intervalId)
    }
  }, [userAccess.status, userAccess.profile?.nationalCode, intervalMinutes])

  const handleAcknowledge = async () => {
    setShowEnded(false)
    try {
      await onForceLogoutRef.current()
    } finally {
      armedRef.current = false
    }
  }

  if (!showEnded) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center backdrop-blur-sm p-4"
      style={{ backgroundColor: 'var(--overlay-backdrop)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-ended-title"
    >
      <div
        className="w-full max-w-[22rem] rounded-3xl border border-warning/40 bg-bg-surface p-5 shadow-elevated animate-scale-in"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <h2 id="shift-ended-title" className="text-base font-bold text-text mb-2">
          {t('auth.shiftEndedTitle')}
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">
          {t('auth.shiftEndedMessage')}
        </p>
        <button
          type="button"
          onClick={() => void handleAcknowledge()}
          className="w-full btn-primary text-sm py-2.5"
        >
          {t('auth.shiftEndedConfirm')}
        </button>
      </div>
    </div>
  )
}
