import { useEffect, useState } from 'react'
import { listMockExtensions } from '../../lib/mockExtensions'
import { useI18n } from '../../lib/i18n'
import type { ExtensionInfo } from '../../../shared/types'

interface ExtensionPickerProps {
  onSelect: (extension: ExtensionInfo) => void
  loading?: boolean
}

export function ExtensionPicker({
  onSelect,
  loading = false,
}: ExtensionPickerProps) {
  const { t } = useI18n()
  const [items, setItems] = useState<ExtensionInfo[]>([])

  useEffect(() => {
    listMockExtensions().then(setItems)
  }, [])

  return (
    <div className="w-full max-w-[30rem] mx-auto p-4">
      <div className="rounded-3xl border border-border bg-bg-surface p-5 shadow-xl">
        <h1 className="text-lg font-bold text-text">{t('auth.extensionTitle')}</h1>
        <p className="text-xs text-text-muted mt-1 mb-4">
          {t('auth.extensionSubtitle')}
        </p>

        <div className="space-y-2">
          {items.map((item) => {
            const busy = item.registeredElsewhere
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy || loading}
                onClick={() => onSelect(item)}
                className={`w-full rounded-2xl border p-3 text-start transition-all ${
                  busy
                    ? 'border-border bg-bg opacity-65 cursor-not-allowed'
                    : 'border-border hover:border-accent hover:bg-accent/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      busy ? 'bg-error/15 text-error' : 'bg-success/15 text-success'
                    }`}
                  >
                    {busy ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="8" x2="16" y2="16" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text">{item.label}</div>
                    <div className="text-xs text-text-secondary">
                      {t('auth.province')}: {item.province} · {t('auth.extensionLabel')}: {item.extension}
                    </div>
                  </div>
                  <div className={`text-xs font-medium ${busy ? 'text-error' : 'text-success'}`}>
                    {busy ? t('auth.extensionBusy') : t('auth.extensionFree')}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {loading && (
          <p className="mt-4 text-xs text-text-muted">{t('auth.settingUpExtension')}</p>
        )}
      </div>
    </div>
  )
}
