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
  const [selectedId, setSelectedId] = useState('')
  const [detailsItem, setDetailsItem] = useState<ExtensionInfo | null>(null)

  useEffect(() => {
    listMockExtensions().then(setItems)
  }, [])

  const getExtensionName = (item: ExtensionInfo) => {
    const raw = item.displayName || item.label || item.extension
    const withoutProvince = raw
      .replace(item.province, '')
      .replace('-', ' ')
      .trim()

    return withoutProvince || item.extension
  }

  const selectedItem = items.find((item) => item.id === selectedId && !item.registeredElsewhere) || null
  const commonProvince =
    items.length > 0 && items.every((item) => item.province === items[0].province)
      ? items[0].province
      : ''
  const titleProvince = commonProvince || items[0]?.province || ''

  return (
    <div className="w-full max-w-[36rem] mx-auto p-2">
      <div className="rounded-3xl border border-border bg-bg-surface p-3 shadow-elevated">
        <h1 className="text-lg font-bold text-text">
          {titleProvince ? `داخلی های استان ${titleProvince}` : t('auth.extensionTitle')}
        </h1>
        <p className="text-xs text-text-muted mt-1 mb-3">
          {t('auth.extensionSubtitle')}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const busy = item.registeredElsewhere
            return (
              <div
                key={item.id}
                className={`w-full rounded-xl border p-2 text-start transition-all ${
                  busy
                    ? 'border-border bg-bg opacity-80'
                    : selectedId === item.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => setSelectedId(item.id)}
                    className={`flex-1 min-w-0 text-start ${busy ? 'cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-text leading-tight truncate" dir="ltr">
                          {getExtensionName(item)}
                        </div>
                      </div>
                      <div
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${
                          busy ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            busy ? 'bg-danger' : 'bg-success'
                          }`}
                        />
                        {busy ? t('auth.extensionBusy') : t('auth.extensionFree')}
                      </div>
                    </div>

                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailsItem(item)}
                    className="w-6 h-6 rounded-lg hover-overlay text-text-muted flex items-center justify-center shrink-0"
                    aria-label="جزئیات"
                    title="جزئیات"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-xs text-text-muted">
            {selectedItem ? (
              <span>
                {t('auth.extensionLabel')}: <span className="text-text font-semibold" dir="ltr">{selectedItem.extension}</span>
              </span>
            ) : (
              <span>یک داخلی را انتخاب کنید</span>
            )}
          </div>
          <button
            type="button"
            disabled={!selectedItem || loading}
            onClick={() => {
              if (selectedItem) onSelect(selectedItem)
            }}
            className={`min-w-[6.5rem] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              !selectedItem || loading
                ? 'bg-bg-surface-2 text-text-muted cursor-not-allowed border border-border'
                : 'btn-primary'
            }`}
          >
            انتخاب
          </button>
        </div>

        {loading && (
          <p className="mt-3 text-xs text-text-muted">{t('auth.settingUpExtension')}</p>
        )}
      </div>

      {detailsItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
          style={{ backgroundColor: 'var(--overlay-backdrop)' }}
          onClick={() => setDetailsItem(null)}
        >
          <div
            className="w-full max-w-[22rem] rounded-3xl border border-border bg-bg-surface p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-text" dir="ltr">
                  {getExtensionName(detailsItem)}
                </h2>
                <p className="text-xs text-text-muted mt-1">
                  {t('auth.extensionLabel')} {detailsItem.extension}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="w-8 h-8 rounded-lg hover-overlay text-text-muted flex items-center justify-center"
                aria-label="بستن"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('auth.province')}</span>
                <span className="text-text font-medium">{detailsItem.province}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">IP</span>
                <span className="text-text font-medium" dir="ltr">{detailsItem.host}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">وضعیت</span>
                <span className={detailsItem.registeredElsewhere ? 'text-danger font-medium' : 'text-success font-medium'}>
                  {detailsItem.registeredElsewhere ? t('auth.extensionBusy') : t('auth.extensionFree')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('auth.extensionLabel')}</span>
                <span className="text-primary font-bold" dir="ltr">{detailsItem.extension}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={detailsItem.registeredElsewhere || loading}
              onClick={() => {
                if (!detailsItem.registeredElsewhere) {
                  setSelectedId(detailsItem.id)
                  setDetailsItem(null)
                }
              }}
              className={`mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                detailsItem.registeredElsewhere || loading
                  ? 'bg-bg-surface-2 text-text-muted cursor-not-allowed border border-border'
                  : 'btn-primary'
              }`}
            >
              انتخاب این داخلی
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
