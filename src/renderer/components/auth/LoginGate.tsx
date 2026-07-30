import { useState } from 'react'
import { useI18n } from '../../lib/i18n'
import {
  loginWithPassword,
  logoutOtherSession,
  qualifyNationalCode,
} from '../../lib/mockAuth'
import type { UserProfile } from '../../../shared/types'

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
  const [conflict, setConflict] = useState<{
    pcName: string
    ipAddress: string
    location: string
    lastSeen: string
  } | null>(null)

  const handleQualify = async () => {
    setError('')
    setQualifiedProfile(null)
    setPassword('')
    setConflict(null)
    setQualifying(true)
    try {
      const result = await qualifyNationalCode(nationalCode)
      if (!result.success || !result.profile) {
        setError(t('auth.invalidNationalCode'))
        return
      }
      setQualifiedProfile(result.profile)
    } finally {
      setQualifying(false)
    }
  }

  const handleLogin = async () => {
    setError('')
    setConflict(null)
    setLoggingIn(true)
    try {
      const result = await loginWithPassword(nationalCode, password)
      if (result.error === 'logged_in_elsewhere' && result.conflict) {
        setConflict(result.conflict)
        return
      }
      if (!result.success || !result.profile) {
        setError(
          result.error === 'invalid_national_code'
            ? t('auth.invalidNationalCode')
            : t('auth.invalidPassword')
        )
        return
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
      if (!result.success || !result.profile) {
        setError(t('auth.retryLoginFailed'))
        return
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
                <div className="mt-3 space-y-1 text-xs text-text-secondary">
                  <p>{t('auth.shiftHour')}: {qualifiedProfile.shiftHour}</p>
                  <p>{t('auth.startDateTime')}: {qualifiedProfile.startDateTime}</p>
                  <p>{t('auth.endDateTime')}: {qualifiedProfile.endDateTime}</p>
                </div>
              </div>

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
          <div className="mt-4 flex justify-end">
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
