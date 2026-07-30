import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { DialPad } from '../dialpad/DialPad'
import { CallHistory } from '../history/CallHistory'
import { useHistoryStore } from '../../stores/historyStore'
import { useSipStore } from '../../stores/sipStore'
import { useI18n } from '../../lib/i18n'
import type { UserAccessState } from '../../../shared/types'

/**
 * Tabbed main phone view: dialpad (default) + recent calls
 * with a badge for missed calls.
 */
interface PhoneTabsProps {
  userAccess: UserAccessState
  selectedExtensionId: string
  onOpenProfile: () => void
}

export function PhoneTabs({
  userAccess,
  selectedExtensionId,
  onOpenProfile,
}: PhoneTabsProps) {
  const { t, isRtl } = useI18n()
  const sipStatus = useSipStore((s) => s.status)
  const [extension, setExtension] = useState('')
  const missedCount = useHistoryStore(
    (s) => s.records.filter((r) => r.result === 'missed').length
  )

  useEffect(() => {
    window.api.settings.get().then((s) => {
      const settings = s as { accounts?: Array<{ id: string; username: string }>; activeAccountId?: string }
      const accounts = settings.accounts || []
      const active = accounts.find((a) => a.id === settings.activeAccountId) || accounts[0]
      setExtension(active?.username || '')
    })
  }, [sipStatus])

  return (
    <Tabs defaultValue="dialpad" className="h-full flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      {userAccess.status !== 'logged_in' ? (
        <div className="flex-shrink-0 mb-3 mt-2 flex items-center">
          <button
            type="button"
            onClick={onOpenProfile}
            className="status-pill !py-0.5 !px-2.5 border-border text-text-secondary bg-bg-surface-2 text-[11px] hover:text-accent transition-colors"
            title={t('auth.notLoggedIn')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{t('auth.notLoggedIn')}</span>
          </button>
        </div>
      ) : !selectedExtensionId ? (
        <div className="flex-shrink-0 mb-3 mt-2 flex items-center">
          <button
            type="button"
            onClick={onOpenProfile}
            className="status-pill !py-0.5 !px-2.5 border-border text-warning bg-bg-surface-2 text-[11px] hover:text-warning-hover transition-colors"
            title={t('auth.setupIncomplete')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{t('auth.setupIncomplete')}</span>
          </button>
        </div>
      ) : extension ? (
        <div className="flex-shrink-0 mb-3 mt-2 flex items-center">
          <span className="status-pill !py-0.5 !px-2.5 border-border text-text-secondary bg-bg-surface-2 text-[11px]" dir="ltr">
            {t('shell.extension', { ext: extension })}
          </span>
        </div>
      ) : null}

      <TabsList className="mb-1.5 flex-shrink-0">
        <TabsTrigger value="dialpad" className="!py-1.5 !text-xs">{t('phone.dialpad')}</TabsTrigger>
        <TabsTrigger value="recent" className="!py-1.5 !text-xs">
          {t('phone.recent')}
          {missedCount > 0 && (
            <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-danger text-text-inverse text-[9px] font-bold leading-none">
              {missedCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dialpad" className="flex-1 min-h-0 overflow-hidden">
        <DialPad />
      </TabsContent>
      <TabsContent value="recent" className="flex-1 overflow-hidden">
        <CallHistory />
      </TabsContent>
    </Tabs>
  )
}
