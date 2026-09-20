import { useEffect, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import {
  detectClientTimezone,
  evaluateClockGate,
  offlineClockResult,
  parseServerTimePayload,
  type ClockCheckResult,
} from '../../../shared/clockGate'

interface ClockGateProps {
  onPassed: () => void
}

export function ClockGate({ onPassed }: ClockGateProps) {
  const { t, isRtl } = useI18n()
  const [checking, setChecking] = useState(true)
  const [result, setResult] = useState<ClockCheckResult | null>(null)

  const runCheck = async () => {
    setChecking(true)
    const clientMs = Date.now()
    const clientTimezone = detectClientTimezone()

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setResult(offlineClockResult(clientMs, clientTimezone, 'offline'))
      setChecking(false)
      return
    }

    try {
      const response = await window.api.system.serverTime()
      if (!response.ok || !response.json) {
        setResult(
          offlineClockResult(
            clientMs,
            clientTimezone,
            response.error || 'offline'
          )
        )
        setChecking(false)
        return
      }

      const parsed = parseServerTimePayload(response.json)
      if (!parsed) {
        setResult(offlineClockResult(clientMs, clientTimezone, 'invalid'))
        setChecking(false)
        return
      }

      const next = evaluateClockGate(clientMs, parsed.serverMs, clientTimezone)
      if (next.ok && !next.blocked) {
        onPassed()
        return
      }
      setResult(next)
    } catch {
      setResult(offlineClockResult(clientMs, clientTimezone, 'offline'))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mode = checking ? null : result?.mode
  const title = checking
    ? t('clock.checkingTitle')
    : mode === 'offline'
      ? t('clock.offlineTitle')
      : t('clock.title')

  return (
    <div
      className="h-full min-h-[24rem] flex items-center justify-center p-4 overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clock-gate-title"
    >
      <div
        className={`w-full max-w-[22rem] rounded-3xl border bg-bg-surface p-5 shadow-elevated space-y-4 ${
          checking
            ? 'border-border'
            : mode === 'clock'
              ? 'border-warning/40'
              : 'border-error/40'
        }`}
      >
        <div>
          <h1 id="clock-gate-title" className="text-lg font-bold text-text">
            {title}
          </h1>
          <p className="text-xs text-text-muted mt-1">{t('clock.subtitle')}</p>
        </div>

        {checking && (
          <div className="rounded-2xl border border-border bg-bg p-3.5 text-xs text-text-secondary leading-relaxed">
            {t('clock.checkingHelp')}
          </div>
        )}

        {!checking && mode === 'offline' && (
          <div className="rounded-2xl border border-error/30 bg-error/10 p-3.5 text-xs text-text leading-relaxed space-y-2">
            <p>{t('clock.offlineMessage')}</p>
            <p>{t('clock.offlineHelp')}</p>
            <p className="text-[11px] text-text-muted">{t('clock.offlineBlocked')}</p>
          </div>
        )}

        {!checking && mode === 'clock' && result && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-text leading-relaxed space-y-3">
              <p>
                {result.clockReason === 'timezone'
                  ? t('clock.timezoneMessage')
                  : t('clock.skewMessage')}
              </p>
              <dl className="grid grid-cols-1 gap-2">
                <div className="rounded-xl border border-border bg-bg-surface px-3 py-2">
                  <dt className="text-[11px] text-text-muted">{t('clock.pcTime')}</dt>
                  <dd className="mt-0.5 font-mono font-bold text-text" dir="ltr">
                    {result.clientDisplay || '—'}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-bg-surface px-3 py-2">
                  <dt className="text-[11px] text-text-muted">{t('clock.tehranTime')}</dt>
                  <dd className="mt-0.5 font-mono font-bold text-text" dir="ltr">
                    {result.serverDisplay || '—'}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-bg-surface px-3 py-2">
                  <dt className="text-[11px] text-text-muted">{t('clock.clientTimezone')}</dt>
                  <dd className="mt-0.5 font-mono font-bold text-text" dir="ltr">
                    {result.clientTimezone || '—'}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-bg-surface px-3 py-2">
                  <dt className="text-[11px] text-text-muted">{t('clock.requiredTimezone')}</dt>
                  <dd className="mt-0.5 font-mono font-bold text-text" dir="ltr">
                    {result.requiredTimezone || 'Asia/Tehran'}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-bg-surface px-3 py-2">
                  <dt className="text-[11px] text-text-muted">{t('clock.skewMinutesLabel')}</dt>
                  <dd className="mt-0.5 font-bold text-text">
                    {result.skewMinutes ?? '—'} {t('clock.minutesUnit')}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-3.5 text-xs text-text-secondary leading-relaxed space-y-1.5">
              <p className="font-semibold text-text">{t('clock.guideTitle')}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>{t('clock.guide1')}</li>
                <li>{t('clock.guide2')}</li>
                <li>{t('clock.guide3')}</li>
                <li>{t('clock.guide4')}</li>
                <li>{t('clock.guide5')}</li>
                <li>{t('clock.guide6')}</li>
              </ol>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className="btn-primary w-full text-sm py-2.5 disabled:opacity-60"
          >
            {checking ? t('clock.checking') : t('clock.retry')}
          </button>
          <p className="text-[11px] text-center text-text-muted leading-relaxed">
            {t('clock.footer')}
          </p>
        </div>
      </div>
    </div>
  )
}
