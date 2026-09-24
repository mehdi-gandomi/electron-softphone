import { useEffect, useRef, useState } from 'react'
import {
  hasTehranRangeEnded,
  isNowWithinTehranRange,
  isOnShiftNow,
} from '../../../shared/shiftTime'
import { nationalCodesEqual } from '../../../shared/nationalCode'
import { fetchShiftInfoByNationalCode } from '../../lib/shiftInfoApi'
import { useI18n } from '../../lib/i18n'
import type { LatestShiftLookup, ShiftAssignment, UserAccessState } from '../../../shared/types'

function isCurrentlyOnShift(lookup: LatestShiftLookup | null): boolean {
  if (!lookup?.hasShift) return false

  const fromApiDates = isNowWithinTehranRange(
    lookup.profile?.startDateTime,
    lookup.profile?.endDateTime
  )
  if (fromApiDates === true) return true

  const shifts = lookup.shifts || []
  if (
    shifts.some((shift) =>
      isOnShiftNow({
        shiftSlotRule: shift.shiftSlotRule,
        orderShift: shift.orderShift,
      })
    )
  ) {
    return true
  }

  if (fromApiDates === false) return false
  if (shifts.length === 0) return lookup.isOnShift === true
  return false
}

function hasExplicitShiftEnded(lookup: LatestShiftLookup | null): boolean {
  if (!lookup?.profile) return false
  return (
    hasTehranRangeEnded(lookup.profile.startDateTime, lookup.profile.endDateTime) ===
    true
  )
}

function toLookup(
  nationalCode: string,
  result: {
    hasShift: boolean
    isOnShift: boolean
    profile: LatestShiftLookup['profile']
    shifts: ShiftAssignment[]
  }
): LatestShiftLookup {
  return {
    nationalCode,
    hasShift: result.hasShift === true,
    isOnShift: result.isOnShift === true,
    profile: result.profile,
    shifts: result.shifts || [],
    fetchedAt: new Date().toISOString(),
  }
}

interface ShiftExpiryGuardProps {
  userAccess: UserAccessState
  intervalMinutes: number
  onForceLogout: () => void | Promise<void>
}

/**
 * While logged in, periodically re-fetches today's shift from the API.
 * When an active shift has ended, shows a popup, logs the user out,
 * releases the extension, and removes the SIP account.
 */
export function ShiftExpiryGuard({
  userAccess,
  intervalMinutes,
  onForceLogout,
}: ShiftExpiryGuardProps) {
  const { t, isRtl } = useI18n()
  const [showEnded, setShowEnded] = useState(false)
  const armedRef = useRef(false)
  const sawOnShiftRef = useRef(false)
  const loggingOutRef = useRef<Promise<void> | null>(null)
  const onForceLogoutRef = useRef(onForceLogout)
  onForceLogoutRef.current = onForceLogout

  useEffect(() => {
    if (armedRef.current) return
    sawOnShiftRef.current = false
    loggingOutRef.current = null
    setShowEnded(false)
  }, [userAccess.profile?.nationalCode])

  useEffect(() => {
    if (userAccess.status !== 'logged_in' || !userAccess.profile) {
      return
    }

    let cancelled = false
    const minutes = Math.max(1, Math.min(1440, Math.floor(intervalMinutes || 10)))
    const periodMs = minutes * 60 * 1000
    const nationalCode = userAccess.profile.nationalCode

    const persistLookup = async (lookup: LatestShiftLookup) => {
      await window.api.settings.set('latestShiftLookup', lookup)
    }

    const runForceLogout = () => {
      if (!loggingOutRef.current) {
        loggingOutRef.current = Promise.resolve(onForceLogoutRef.current()).catch(
          () => undefined
        )
      }
      return loggingOutRef.current
    }

    const runCheck = async () => {
      if (cancelled || armedRef.current || !nationalCode) return
      try {
        const settings = (await window.api.settings.get()) as {
          latestShiftLookup?: LatestShiftLookup | null
        }
        let lookup = settings.latestShiftLookup || null
        if (
          lookup &&
          nationalCodesEqual(lookup.nationalCode, nationalCode) &&
          lookup.hasShift &&
          (lookup.isOnShift || isCurrentlyOnShift(lookup))
        ) {
          sawOnShiftRef.current = true
        }

        const refreshed = await fetchShiftInfoByNationalCode(nationalCode)
        if (cancelled || armedRef.current) return

        if (refreshed.success) {
          lookup = toLookup(nationalCode, refreshed)
          await persistLookup(lookup)
        } else if (
          lookup &&
          nationalCodesEqual(lookup.nationalCode, nationalCode) &&
          (lookup.shifts || []).length > 0
        ) {
          lookup = {
            ...lookup,
            isOnShift: isCurrentlyOnShift(lookup),
          }
        } else {
          return
        }

        if (!nationalCodesEqual(lookup.nationalCode, nationalCode)) return

        if (isCurrentlyOnShift(lookup)) {
          sawOnShiftRef.current = true
          if (lookup.isOnShift !== true) {
            lookup = { ...lookup, isOnShift: true }
            await persistLookup(lookup)
          }
          return
        }

        const endedByDates = hasExplicitShiftEnded(lookup)
        const datesKnown =
          isNowWithinTehranRange(
            lookup.profile?.startDateTime,
            lookup.profile?.endDateTime
          ) !== null
        const endedByRules =
          !datesKnown &&
          sawOnShiftRef.current &&
          (lookup.shifts || []).length > 0

        if (!endedByDates && !endedByRules) return

        armedRef.current = true
        await persistLookup({
          ...lookup,
          isOnShift: false,
        })
        if (cancelled) return
        setShowEnded(true)
        void runForceLogout()
      } catch {
        // Ignore transient failures; the next interval will retry.
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
    try {
      if (!loggingOutRef.current) {
        loggingOutRef.current = Promise.resolve(onForceLogoutRef.current()).catch(
          () => undefined
        )
      }
      await loggingOutRef.current
    } finally {
      setShowEnded(false)
      armedRef.current = false
      sawOnShiftRef.current = false
      loggingOutRef.current = null
    }
  }

  if (!showEnded) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center backdrop-blur-sm p-4"
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
