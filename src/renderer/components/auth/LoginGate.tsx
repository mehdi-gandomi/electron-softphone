import { useState } from 'react'
import { useI18n } from '../../lib/i18n'
import {
  loginWithPassword,
  logoutOtherSession,
  qualifyNationalCode,
} from '../../lib/mockAuth'
import { formatJalaliDateLong } from '../../lib/persianDate'
import { nationalCodesEqual } from '../../../shared/nationalCode'
import type { LatestShiftLookup, UserProfile } from '../../../shared/types'

interface LoginGateProps {
  allowSkip?: boolean
  onSkip?: () => void
  onLoginSuccess: (profile: UserProfile) => void
}

export function LoginGate({
  allowSkip = false,
  onSkip,
  onLoginSuccess,
}: LoginGateProps) {
  const { t } = useI18n()
  const [nationalCode, setNationalCode] = useState('')
  const [password, setPassword] = useState('')
  const [qualifiedProfile, setQualifiedProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState('')
  const [qualifying, setQualifying] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [resolvingConflict, setResolvingConflict] = useState(false)
  const [hasShift, setHasShift] = useState<boolean | null>(null)
  const [isOnShift, setIsOnShift] = useState<boolean | null>(null)
  const [outsideShift, setOutsideShift] = useState(false)
  const [shiftWindow, setShiftWindow] = useState<{ start?: string; end?: string } | null>(null)
  const [conflict, setConflict] = useState<{
    pcName: string
    ipAddress: string
    location: string
    lastSeen: string
  } | null>(null)

  const handleQualify = async () => {
    setError('')
    setQualifiedProfile(null)
    setHasShift(null)
    setIsOnShift(null)
    setOutsideShift(false)
    setShiftWindow(null)
    setPassword('')
    setConflict(null)
    setQualifying(true)
    try {
      const result = await qualifyNationalCode(nationalCode)
      if (!result.success || !result.profile) {
        await window.api.settings.set('latestShiftLookup', null)
        setError(result.error || t('auth.invalidNationalCode'))
        return
      }
      await window.api.settings.set('latestShiftLookup', {
        nationalCode: result.profile.nationalCode,
        hasShift: result.hasShift === true,
        isOnShift: result.isOnShift === true,
        profile: result.profile,
        shifts: result.shifts || [],
        fetchedAt: new Date().toISOString(),
      })
      setQualifiedProfile(result.profile)
      setHasShift(result.hasShift === true)
      setIsOnShift(result.isOnShift === true)
    } finally {
      setQualifying(false)
    }
  }

  const handleLogin = async () => {
    setError('')
    setConflict(null)
    setOutsideShift(false)
    setShiftWindow(null)
    setLoggingIn(true)
    try {
      const result = await loginWithPassword(nationalCode, password)
      if (result.error === 'logged_in_elsewhere' && result.conflict) {
        setConflict(result.conflict)
        return
      }
      if (result.errorCode === 'OUTSIDE_SHIFT_HOURS') {
        if (result.profile) setQualifiedProfile(result.profile)
        setOutsideShift(true)
        setHasShift(true)
        setIsOnShift(false)
        setShiftWindow({
          start: result.shiftAccess?.shiftStart,
          end: result.shiftAccess?.shiftEnd,
        })
        setError(result.error || t('auth.outsideShift'))
        return
      }
      if (!result.success || !result.profile || !result.session) {
        setError(result.error || t('auth.invalidPassword'))
        return
      }
      await window.api.settings.set('authSession', result.session)
      if (result.profile) {
        const current = (await window.api.settings.get()) as {
          latestShiftLookup?: LatestShiftLookup | null
        }
        const previous = current.latestShiftLookup
        const sameUser = nationalCodesEqual(
          previous?.nationalCode,
          result.profile.nationalCode
        )
        await window.api.settings.set('latestShiftLookup', {
          nationalCode: result.profile.nationalCode,
          hasShift:
            typeof result.hasShift === 'boolean'
              ? result.hasShift
              : sameUser
                ? previous?.hasShift === true
                : false,
          isOnShift:
            result.shiftAccess?.isWithinShift === true ||
            result.hasShift === false ||
            (sameUser ? previous?.isOnShift === true : false),
          profile: result.profile,
          shifts:
            result.shifts && result.shifts.length > 0
              ? result.shifts
              : sameUser && previous?.shifts?.length
                ? previous.shifts
                : [],
          fetchedAt: new Date().toISOString(),
        })
      }
      onLoginSuccess(result.profile)
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogoutOtherSystem = async () => {
    setResolvingConflict(true)
    try {
      await logoutOtherSession(nationalCode)
      setConflict(null)
      const result = await loginWithPassword(nationalCode, password)
      if (result.errorCode === 'OUTSIDE_SHIFT_HOURS') {
        if (result.profile) setQualifiedProfile(result.profile)
        setOutsideShift(true)
        setHasShift(true)
        setIsOnShift(false)
        setShiftWindow({
          start: result.shiftAccess?.shiftStart,
          end: result.shiftAccess?.shiftEnd,
        })
        setError(result.error || t('auth.outsideShift'))
        return
      }
      if (!result.success || !result.profile || !result.session) {
        setError(result.error || t('auth.retryLoginFailed'))
        return
      }
      await window.api.settings.set('authSession', result.session)
      if (result.profile) {
        const current = (await window.api.settings.get()) as {
          latestShiftLookup?: LatestShiftLookup | null
        }
        const previous = current.latestShiftLookup
        const sameUser = nationalCodesEqual(
          previous?.nationalCode,
          result.profile.nationalCode
        )
        await window.api.settings.set('latestShiftLookup', {
          nationalCode: result.profile.nationalCode,
          hasShift:
            typeof result.hasShift === 'boolean'
              ? result.hasShift
              : sameUser
                ? previous?.hasShift === true
                : false,
          isOnShift:
            result.shiftAccess?.isWithinShift === true ||
            result.hasShift === false ||
            (sameUser ? previous?.isOnShift === true : false),
          profile: result.profile,
          shifts:
            result.shifts && result.shifts.length > 0
              ? result.shifts
              : sameUser && previous?.shifts?.length
                ? previous.shifts
                : [],
          fetchedAt: new Date().toISOString(),
        })
      }
      onLoginSuccess(result.profile)
    } finally {
      setResolvingConflict(false)
    }
  }

  return (
    <div className="h-full min-h-[24rem] flex items-center justify-center p-4">
      <div className="w-full max-w-[22rem] rounded-3xl border border-border bg-bg-surface p-5 shadow-xl">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-text">{t('auth.title')}</h1>
          <p className="text-xs text-text-muted">{t('auth.subtitle')}</p>
        </div>

        <div className="space-y-3">
          {conflict ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-error/40 bg-error/10 p-3">
                <div className="text-sm font-semibold text-text">
                  {t('auth.conflictTitle')}
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {t('auth.conflictMessage')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-bg p-3 text-xs text-text-secondary space-y-1">
                <p>{t('auth.pcName')}: {conflict.pcName}</p>
                <p>{t('auth.ipAddress')}: {conflict.ipAddress}</p>
                <p>{t('auth.location')}: {conflict.location}</p>
                <p>{t('auth.lastSeen')}: {conflict.lastSeen}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogoutOtherSystem()}
                disabled={resolvingConflict}
                className="btn-primary w-full text-sm py-2 disabled:opacity-60"
              >
                {resolvingConflict
                  ? t('auth.loggingOutOtherSystem')
                  : t('auth.logoutOtherSystem')}
              </button>
            </div>
          ) : (
            <>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              {t('auth.nationalCode')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={nationalCode}
              onChange={(e) => setNationalCode(e.target.value)}
              className="input-field text-sm font-mono"
              placeholder={t('auth.nationalCodePlaceholder')}
              dir="ltr"
            />
          </div>

          {!qualifiedProfile ? (
            <button
              type="button"
              onClick={() => void handleQualify()}
              disabled={!nationalCode.trim() || qualifying}
              className="btn-primary w-full text-sm py-2 disabled:opacity-60"
            >
              {qualifying ? t('auth.checking') : t('auth.qualify')}
            </button>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-bg p-3">
                <div className="mb-3 pb-2 border-b border-border">
                  <p className="text-[11px] text-text-muted">{t('auth.today')}</p>
                  <p className="text-sm font-semibold text-text" dir="rtl">
                    {formatJalaliDateLong()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {qualifiedProfile.imageUrl ? (
                    <img
                      src={qualifiedProfile.imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold">
                      {qualifiedProfile.firstName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text truncate">
                      {qualifiedProfile.firstName} {qualifiedProfile.lastName}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {qualifiedProfile.position}
                    </p>
                  </div>
                </div>
                {(qualifiedProfile.shiftHour ||
                  qualifiedProfile.startDateTime ||
                  qualifiedProfile.endDateTime) && (
                  <div className="mt-3 space-y-1 text-xs text-text-secondary">
                    {qualifiedProfile.shiftHour && (
                      <p>{t('auth.shiftType')}: {qualifiedProfile.shiftHour}</p>
                    )}
                    {qualifiedProfile.startDateTime && (
                      <p>
                        {t('auth.startDateTime')}:{' '}
                        <span dir="rtl">{qualifiedProfile.startDateTime}</span>
                      </p>
                    )}
                    {qualifiedProfile.endDateTime && (
                      <p>
                        {t('auth.endDateTime')}:{' '}
                        <span dir="rtl">{qualifiedProfile.endDateTime}</span>
                      </p>
                    )}
                    {qualifiedProfile.provinceTitle && (
                      <p>{t('auth.province')}: {qualifiedProfile.provinceTitle}</p>
                    )}
                    {qualifiedProfile.branchTitle && (
                      <p>{t('auth.location')}: {qualifiedProfile.branchTitle}</p>
                    )}
                  </div>
                )}
              </div>

              {outsideShift ? (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3">
                  <div className="text-sm font-semibold text-text">{t('auth.outsideShift')}</div>
                  <p className="text-xs text-text-secondary mt-1">{t('auth.outsideShiftHelp')}</p>
                  {(shiftWindow?.start || shiftWindow?.end) && (
                    <div className="mt-2 space-y-1 text-xs text-text-secondary">
                      {shiftWindow.start && (
                        <p>
                          {t('auth.startDateTime')}: <span dir="rtl">{shiftWindow.start}</span>
                        </p>
                      )}
                      {shiftWindow.end && (
                        <p>
                          {t('auth.endDateTime')}: <span dir="rtl">{shiftWindow.end}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : hasShift && isOnShift ? (
                <div className="rounded-2xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                  {t('auth.shiftAvailable')}
                </div>
              ) : hasShift ? (
                <div className="rounded-2xl border border-border bg-bg-surface-2 px-3 py-2 text-xs text-text-secondary">
                  {t('auth.shiftCheckServer')}
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-bg-surface-2 px-3 py-2 text-xs text-text-secondary">
                  {t('auth.noShiftCanLogin')}
                </div>
              )}

              <div>
                <label className="block text-xs text-text-secondary mb-1.5">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field text-sm"
                  placeholder={t('auth.passwordPlaceholder')}
                />
              </div>

              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={!password || loggingIn}
                className="btn-primary w-full text-sm py-2 disabled:opacity-60"
              >
                {loggingIn ? t('auth.loggingIn') : t('auth.login')}
              </button>
            </>
          )}
            </>
          )}

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {allowSkip && onSkip && (
          <div className="mt-4 flex justify-end border-t border-border pt-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-text-muted hover:text-text transition-colors"
            >
              {t('auth.skip')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
