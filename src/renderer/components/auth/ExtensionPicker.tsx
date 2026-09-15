import { useCallback, useEffect, useState } from 'react'
import {
  fetchExtensionsStatus,
  logoutExtension,
  reserveExtension,
} from '../../lib/extensionsApi'
import { useI18n } from '../../lib/i18n'
import { nationalCodesEqual, normalizeNationalCode } from '../../../shared/nationalCode'
import type { ExtensionInfo } from '../../../shared/types'

interface ExtensionPickerProps {
  provinceId: number
  provinceTitle: string
  nationalCode: string
  /** Current reserved extension number (change mode). */
  currentExtension?: string
  mode?: 'setup' | 'change'
  /** Hide outer card chrome when embedded in a modal. */
  embedded?: boolean
  onSelect: (
    extension: ExtensionInfo,
    reservation?: {
      reservationId?: number
      provinceId?: number
      extension?: string
      reservedAt?: string
      ip?: string
      username?: string
      password?: string
    }
  ) => void | Promise<void | { success: boolean; error?: string }>
  onSkip?: () => void
  loading?: boolean
}

function normalizeExt(value: string | null | undefined): string {
  return String(value || '').trim()
}

export function ExtensionPicker({
  provinceId,
  provinceTitle,
  nationalCode,
  currentExtension = '',
  mode = 'setup',
  embedded = false,
  onSelect,
  onSkip,
  loading = false,
}: ExtensionPickerProps) {
  const { t } = useI18n()
  const [items, setItems] = useState<ExtensionInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detailsItem, setDetailsItem] = useState<ExtensionInfo | null>(null)
  const [fetching, setFetching] = useState(false)
  const [reserving, setReserving] = useState(false)
  const [error, setError] = useState('')

  const selfNationalCode = normalizeNationalCode(nationalCode)
  const currentExt = normalizeExt(currentExtension)

  const isOwnOccupation = useCallback(
    (item: ExtensionInfo) =>
      nationalCodesEqual(selfNationalCode, item.occupiedByNationalCode),
    [selfNationalCode]
  )

  const isCurrent = useCallback(
    (item: ExtensionInfo) =>
      Boolean(currentExt && normalizeExt(item.extension) === currentExt),
    [currentExt]
  )

  /** Busy for others only — own / current line stays selectable. */
  const isHardBusy = useCallback(
    (item: ExtensionInfo) =>
      Boolean(item.registeredElsewhere) && !isOwnOccupation(item) && !isCurrent(item),
    [isOwnOccupation, isCurrent]
  )

  const loadStatus = useCallback(async () => {
    setFetching(true)
    setError('')
    try {
      const result = await fetchExtensionsStatus(provinceId, provinceTitle)
      if (!result.success) {
        setItems([])
        setError(result.error)
        return
      }
      setItems(result.items)
    } finally {
      setFetching(false)
    }
  }, [provinceId, provinceTitle])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const selectedItem =
    items.find((item) => item.id === selectedId && !isHardBusy(item)) || null
  const busy = loading || fetching || reserving

  const handleConfirm = async (item: ExtensionInfo) => {
    if (isHardBusy(item) || reserving || loading) return
    setSelectedId(item.id)
    setReserving(true)
    setError('')
    try {
      const targetExt = normalizeExt(item.extension)

      // Change mode: free previous reservation before reserving a different line
      if (
        mode === 'change' &&
        currentExt &&
        currentExt !== '__skipped__' &&
        targetExt !== currentExt
      ) {
        const released = await logoutExtension({
          nationalCode: selfNationalCode,
          extension: currentExt,
          provinceId,
        })
        if (!released.success) {
          setError(released.error || t('auth.extensionReleaseFailed'))
          await loadStatus()
          return
        }
      }

      // Re-selecting the same current extension: still re-reserve for fresh SIP creds
      const result = await reserveExtension({
        provinceId,
        nationalCode: selfNationalCode,
        extension: targetExt,
      })
      if (!result.success) {
        setError(result.error)
        await loadStatus()
        return
      }

      const reservedItem: ExtensionInfo = {
        ...item,
        extension: result.extension,
        username: result.username,
        host: result.ip,
        password: result.password,
        displayName: result.extension,
        registeredElsewhere: false,
        occupiedByNationalCode: selfNationalCode || null,
      }

      const setup = await onSelect(reservedItem, {
        reservationId: result.reservationId,
        provinceId: result.provinceId ?? provinceId,
        extension: result.extension,
        reservedAt: result.reservedAt,
        ip: result.ip,
        username: result.username,
        password: result.password,
      })

      if (setup && typeof setup === 'object' && setup.success === false) {
        setError(setup.error || t('auth.extensionSetupFailed'))
        await loadStatus()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.extensionSetupFailed'))
      await loadStatus()
    } finally {
      setReserving(false)
    }
  }

  const title =
    mode === 'change'
      ? t('auth.changeExtensionTitle')
      : provinceTitle
        ? t('auth.extensionTitleProvince', { province: provinceTitle })
        : t('auth.extensionTitle')

  const subtitle =
    mode === 'change' ? t('auth.changeExtensionSubtitle') : t('auth.extensionSubtitle')

  const cardClass = embedded
    ? 'w-full'
    : 'w-full max-w-[36rem] mx-auto p-2'

  const innerClass = embedded
    ? 'w-full'
    : 'rounded-3xl border border-border bg-bg-surface p-3 shadow-elevated'

  return (
    <div className={cardClass}>
      <div className={innerClass}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            {!embedded && (
              <>
                <h1 className="text-lg font-bold text-text">{title}</h1>
                <p className="text-xs text-text-muted mt-1">{subtitle}</p>
              </>
            )}
            {mode === 'change' && currentExt && currentExt !== '__skipped__' && (
              <p className={`text-[11px] text-text-secondary ${embedded ? '' : 'mt-1'}`}>
                {t('auth.currentExtension')}:{' '}
                <span className="font-semibold text-text" dir="ltr">
                  {currentExt}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={busy}
            className="text-[11px] text-accent hover:underline disabled:opacity-50 shrink-0"
          >
            {t('auth.refreshExtensions')}
          </button>
        </div>

        {fetching && items.length === 0 ? (
          <p className="text-xs text-text-muted py-6 text-center">{t('auth.loadingExtensions')}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-text-muted py-6 text-center">
            {error || t('auth.noExtensions')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {items.map((item) => {
              const hardBusy = isHardBusy(item)
              const mine = isOwnOccupation(item) || isCurrent(item)
              const statusLabel = hardBusy
                ? t('auth.extensionBusy')
                : mine
                  ? t('auth.extensionYours')
                  : t('auth.extensionFree')
              const statusClass = hardBusy
                ? 'bg-danger/10 text-danger'
                : mine
                  ? 'bg-accent/10 text-accent'
                  : 'bg-success/10 text-success'
              const dotClass = hardBusy
                ? 'bg-danger'
                : mine
                  ? 'bg-accent'
                  : 'bg-success'

              return (
                <div
                  key={item.id}
                  className={`w-full rounded-xl border p-2 text-start transition-all ${
                    hardBusy
                      ? 'border-border bg-bg opacity-80'
                      : selectedId === item.id || isCurrent(item)
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <button
                      type="button"
                      disabled={hardBusy || reserving || loading}
                      onClick={() => void handleConfirm(item)}
                      className={`flex-1 min-w-0 text-start ${hardBusy ? 'cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className="text-[13px] font-semibold text-text leading-tight truncate"
                            dir="ltr"
                          >
                            {item.extension}
                          </div>
                          {hardBusy && item.occupiedByNationalCode && (
                            <div className="text-[10px] text-text-muted mt-0.5 truncate" dir="ltr">
                              {item.occupiedByNationalCode}
                            </div>
                          )}
                        </div>
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${statusClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                          {statusLabel}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDetailsItem(item)}
                      className="w-6 h-6 rounded-lg hover-overlay text-text-muted flex items-center justify-center shrink-0"
                      aria-label={t('auth.extensionDetails')}
                      title={t('auth.extensionDetails')}
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
        )}

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-xs text-text-muted">
            {selectedItem ? (
              <span>
                {t('auth.extensionLabel')}:{' '}
                <span className="text-text font-semibold" dir="ltr">
                  {selectedItem.extension}
                </span>
              </span>
            ) : (
              <span>{t('auth.pickExtension')}</span>
            )}
          </div>
          <button
            type="button"
            disabled={!selectedItem || busy}
            onClick={() => {
              if (selectedItem) void handleConfirm(selectedItem)
            }}
            className={`min-w-[6.5rem] rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              !selectedItem || busy
                ? 'bg-bg-surface-2 text-text-muted cursor-not-allowed border border-border'
                : 'btn-primary'
            }`}
          >
            {reserving
              ? t('auth.reservingExtension')
              : mode === 'change'
                ? t('auth.confirmChangeExtension')
                : t('auth.selectExtension')}
          </button>
        </div>

        {(loading || reserving) && (
          <p className="mt-3 text-xs text-text-muted">
            {mode === 'change'
              ? t('auth.changingExtension')
              : t('auth.settingUpExtension')}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-error">{error}</p>}

        {onSkip && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onSkip}
              disabled={reserving}
              className="text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
            >
              {mode === 'change' ? t('auth.cancel') : t('auth.skip')}
            </button>
          </div>
        )}
      </div>

      {detailsItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center backdrop-blur-sm p-4"
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
                  {detailsItem.extension}
                </h2>
                <p className="text-xs text-text-muted mt-1">
                  {t('auth.extensionLabel')} {detailsItem.extension}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="w-8 h-8 rounded-lg hover-overlay text-text-muted flex items-center justify-center"
                aria-label={t('auth.cancel')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('auth.province')}</span>
                <span className="text-text font-medium">{detailsItem.province || provinceTitle}</span>
              </div>
              {detailsItem.host && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text-muted">IP</span>
                  <span className="text-text font-medium" dir="ltr">{detailsItem.host}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('auth.extensionStatus')}</span>
                <span
                  className={
                    isHardBusy(detailsItem)
                      ? 'text-danger font-medium'
                      : isOwnOccupation(detailsItem) || isCurrent(detailsItem)
                        ? 'text-accent font-medium'
                        : 'text-success font-medium'
                  }
                >
                  {isHardBusy(detailsItem)
                    ? t('auth.extensionBusy')
                    : isOwnOccupation(detailsItem) || isCurrent(detailsItem)
                      ? t('auth.extensionYours')
                      : t('auth.extensionFree')}
                </span>
              </div>
              {detailsItem.occupiedByNationalCode && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text-muted">{t('auth.nationalCode')}</span>
                  <span className="text-text font-medium" dir="ltr">
                    {detailsItem.occupiedByNationalCode}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('auth.extensionLabel')}</span>
                <span className="text-primary font-bold" dir="ltr">{detailsItem.extension}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isHardBusy(detailsItem) || reserving || loading}
              onClick={() => {
                if (!isHardBusy(detailsItem)) {
                  setDetailsItem(null)
                  void handleConfirm(detailsItem)
                }
              }}
              className={`mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                isHardBusy(detailsItem) || reserving || loading
                  ? 'bg-bg-surface-2 text-text-muted cursor-not-allowed border border-border'
                  : 'btn-primary'
              }`}
            >
              {reserving
                ? t('auth.reservingExtension')
                : mode === 'change'
                  ? t('auth.confirmChangeExtension')
                  : t('auth.selectThisExtension')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
