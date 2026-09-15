import { useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { hasNewerRelease, useUpdater } from '../../lib/useUpdater'

export function UpdateAvailableModal() {
  const { t, isRtl } = useI18n()
  const { status, download, install } = useUpdater({ checkOnMount: true })
  const [dismissed, setDismissed] = useState(false)

  const busy = status.state === 'checking' || status.state === 'downloading'
  const show = !dismissed && hasNewerRelease(status)

  if (!show) return null

  const version = status.latestVersion || ''

  return (
    <div
      className="fixed inset-0 z-[62] flex items-center justify-center backdrop-blur-sm p-4"
      style={{ backgroundColor: 'var(--overlay-backdrop)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-arrived-title"
    >
      <div
        className="w-full max-w-[20rem] rounded-3xl border border-accent/30 bg-bg-surface p-5 shadow-elevated animate-scale-in"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <h2 id="update-arrived-title" className="text-base font-bold text-text mb-1">
          {t('settings.update.popupTitle')}
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t('settings.update.popupBody', { version })}
        </p>
        {status.releaseNotes ? (
          <p className="mt-2 text-xs text-text-muted whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
            {status.releaseNotes}
          </p>
        ) : null}
        {!status.canInstall && (
          <p className="mt-2 text-xs text-text-muted">
            {status.portable ? t('settings.update.portable') : t('settings.update.devMode')}
          </p>
        )}

        {status.state === 'downloading' && (
          <div className="mt-3">
            <p className="text-[11px] text-text-secondary mb-1">
              {t('settings.update.downloading', { percent: status.progress })}
            </p>
            <div className="h-1.5 rounded-full bg-bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.max(2, status.progress)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {status.state === 'ready' && status.canInstall ? (
            <button type="button" onClick={() => void install()} className="btn-primary w-full text-sm py-2">
              {t('settings.update.install')}
            </button>
          ) : status.canInstall ? (
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy}
              className="btn-primary w-full text-sm py-2 disabled:opacity-60"
            >
              {t('settings.update.download')}
            </button>
          ) : null}
          {status.state !== 'downloading' && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="btn-ghost w-full text-sm py-2"
            >
              {t('settings.update.later')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
