import { useEffect, useState } from 'react'
import { useI18n } from '../../lib/i18n'

type ClockCheckResult = Awaited<ReturnType<typeof window.api.system.checkClock>>

interface ClockGateProps {
  onPassed: () => void
}

function formatSkew(ms: number, isRtl: boolean): string {
  const totalSec = Math.round(ms / 1000)
  const abs = Math.abs(totalSec)
  const hours = Math.floor(abs / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60
  const parts: string[] = []
  if (hours > 0) parts.push(isRtl ? `${hours} ساعت` : `${hours}h`)
  if (minutes > 0 || hours > 0) parts.push(isRtl ? `${minutes} دقیقه` : `${minutes}m`)
  parts.push(isRtl ? `${seconds} ثانیه` : `${seconds}s`)
  return parts.join(isRtl ? ' و ' : ' ')
}

export function ClockGate({ onPassed }: ClockGateProps) {
  const { t, isRtl } = useI18n()
  const [checking, setChecking] = useState(true)
  const [result, setResult] = useState<ClockCheckResult | null>(null)

  const runCheck = async () => {
    setChecking(true)
    try {
      const next = await window.api.system.checkClock()
      setResult(next)
      if (next.ok && !next.blocked) {
        onPassed()
      }
    } catch {
      setResult({
        ok: false,
        blocked: true,
        skewMs: 0,
        maxSkewMs: 5 * 60 * 1000,
        localTimeMs: Date.now(),
        trustedTimeMs: null,
        source: null,
        localLabel: '',
        trustedLabel: null,
        error: 'offline',
      })
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (checking && !result) {
    return (
      <div className="h-full min-h-[24rem] flex items-center justify-center p-4">
        <div className="w-full max-w-[22rem] rounded-3xl border border-border bg-bg-surface p-5 shadow-xl text-center">
          <h1 className="text-lg font-bold text-text">{t('clock.checkingTitle')}</h1>
          <p className="text-xs text-text-muted mt-2">{t('clock.checking')}</p>
        </div>
      </div>
    )
  }

  const offline = result?.error === 'offline' || result?.error === 'trusted_time_unavailable'
  const skewMinutes = Math.max(1, Math.round((result?.maxSkewMs || 0) / 60000))

  return (
    <div className="h-full min-h-[24rem] flex items-center justify-center p-4">
      <div className="w-full max-w-[22rem] rounded-3xl border border-error/40 bg-bg-surface p-5 shadow-xl space-y-4">
        <div>
          <h1 className="text-lg font-bold text-text">
            {offline ? t('clock.offlineTitle') : t('clock.title')}
          </h1>
          <p className="text-xs text-text-muted mt-1">
            {offline
              ? t('clock.offlineMessage')
              : t('clock.skewMessage', { minutes: String(skewMinutes) })}
          </p>
        </div>

        {!offline && result && (
          <div className="rounded-2xl border border-border bg-bg p-3 text-xs text-text-secondary space-y-1.5" dir="ltr">
            <p>
              <span className="text-text-muted">{t('clock.pcTime')}: </span>
              <span className="font-mono text-text">{result.localLabel || '—'}</span>
            </p>
            <p>
              <span className="text-text-muted">{t('clock.trustedTime')}: </span>
              <span className="font-mono text-text">{result.trustedLabel || '—'}</span>
            </p>
            <p>
              <span className="text-text-muted">{t('clock.difference')}: </span>
              <span className="font-mono text-error">{formatSkew(result.skewMs, isRtl)}</span>
            </p>
            <p className="text-[10px] text-text-muted">
              {t('clock.timezone')}: Asia/Tehran
              {result.source ? ` · ${result.source}` : ''}
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-bg p-3 space-y-2">
          <div className="text-xs font-semibold text-text">
            {offline ? t('clock.offlineGuideTitle') : t('clock.guideTitle')}
          </div>
          <ol className="list-decimal list-inside text-xs text-text-secondary space-y-1.5 leading-relaxed">
            {offline ? (
              <>
                <li>{t('clock.offlineGuide1')}</li>
                <li>{t('clock.offlineGuide2')}</li>
                <li>{t('clock.offlineGuide3')}</li>
              </>
            ) : (
              <>
                <li>{t('clock.guide1')}</li>
                <li>{t('clock.guide2')}</li>
                <li>{t('clock.guide3')}</li>
                <li>{t('clock.guide4')}</li>
              </>
            )}
          </ol>
        </div>

        <div className="flex flex-col gap-2">
          {!offline && (
            <button
              type="button"
              onClick={() => void window.api.system.openDateSettings()}
              className="btn-primary w-full text-sm py-2"
            >
              {t('clock.openSettings')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className={
              offline
                ? 'btn-primary w-full text-sm py-2 disabled:opacity-60'
                : 'w-full text-sm py-2 rounded-xl border border-border bg-bg hover:bg-bg-elevated transition-colors disabled:opacity-60'
            }
          >
            {checking ? t('clock.checking') : t('clock.retry')}
          </button>
          <button
            type="button"
            onClick={() => window.api.window.close()}
            className="w-full text-sm py-2 rounded-xl text-error hover:bg-error/10 transition-colors"
          >
            {t('clock.closeApp')}
          </button>
        </div>
      </div>
    </div>
  )
}
