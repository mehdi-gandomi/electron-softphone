import { X } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { ExtensionPicker } from './ExtensionPicker'
import type { ExtensionInfo } from '../../../shared/types'

interface ExtensionChangeModalProps {
  open: boolean
  onClose: () => void
  provinceId: number
  provinceTitle: string
  nationalCode: string
  currentExtension?: string
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
}

export function ExtensionChangeModal({
  open,
  onClose,
  provinceId,
  provinceTitle,
  nationalCode,
  currentExtension,
  onSelect,
}: ExtensionChangeModalProps) {
  const { t, isRtl } = useI18n()

  if (!open) return null

  const handleSelect: ExtensionChangeModalProps['onSelect'] = async (
    extension,
    reservation
  ) => {
    const result = await onSelect(extension, reservation)
    if (result && typeof result === 'object' && result.success === false) {
      return result
    }
    onClose()
    return result
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center backdrop-blur-sm p-3"
      style={{ backgroundColor: 'var(--overlay-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="extension-change-title"
    >
      <div
        className="w-full max-w-[36rem] max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-bg-surface p-4 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-start justify-between gap-3 mb-2 px-1">
          <div className="min-w-0">
            <h2 id="extension-change-title" className="text-base font-bold text-text">
              {t('auth.changeExtensionTitle')}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {t('auth.changeExtensionSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover-overlay text-text-muted flex items-center justify-center shrink-0"
            aria-label={t('auth.cancel')}
          >
            <X size={16} />
          </button>
        </div>

        <ExtensionPicker
          embedded
          mode="change"
          provinceId={provinceId}
          provinceTitle={provinceTitle}
          nationalCode={nationalCode}
          currentExtension={currentExtension}
          onSelect={handleSelect}
          onSkip={onClose}
        />
      </div>
    </div>
  )
}
