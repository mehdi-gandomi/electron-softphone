import { useState, useEffect, type ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import { PhoneFrame } from './components/layout/PhoneFrame'
import { PhoneTabs } from './components/phone/PhoneTabs'
import { ThemeProvider } from './lib/theme'
import { I18nProvider, useI18n } from './lib/i18n'
import { initNotifications, notifyIncomingCall, closeIncomingCallNotification } from './lib/notifications'
import { ContactList } from './components/contacts/ContactList'
import { CallHistory } from './components/history/CallHistory'
import { Settings } from './components/settings/Settings'
import { AutoFillForm } from './components/autofill/AutoFillForm'
import { ActiveCall } from './components/call/ActiveCall'
import { IncomingCall } from './components/call/IncomingCall'
import { CallAudio } from './components/call/CallAudio'
import { ExtensionPicker } from './components/auth/ExtensionPicker'
import { LoginGate } from './components/auth/LoginGate'
import { WindowHeader } from './components/layout/WindowHeader'
import { ProfilePanel } from './components/profile/ProfilePanel'
import { useSipStore } from './stores/sipStore'
import { useCallStore } from './stores/callStore'
import { useHistoryStore } from './stores/historyStore'
import { getBuildMockExtensions } from '../shared/buildConfig'
import type {
  RegistrationInfo,
  CallInfo,
  CallState,
  CallRecord,
  CallResult,
  AppSettings,
  ExtensionInfo,
  SipAccount,
  UserAccessState,
  UserProfile,
} from '../shared/types'

type Page = 'dialpad' | 'contacts' | 'history' | 'settings' | 'autofill' | 'profile'

type CallEndedPayload = {
  callId: string
  duration: number
  direction?: 'inbound' | 'outbound'
  remoteNumber?: string
  remoteName?: string
  answered?: boolean
  result?: CallResult
  codec?: CallInfo['codec']
  timestamp?: number
}

type CallStatePayload = {
  callId: string
  state: CallState
  answerTime?: number
  isMuted?: boolean
  isOnHold?: boolean
  duration?: number
  call?: CallInfo
}

function recordCallHistory(payload: CallEndedPayload, existing?: CallInfo | null) {
  const direction = payload.direction || existing?.direction || 'outbound'
  const answered = payload.answered ?? (existing ? existing.answerTime > 0 : false)
  const result: CallResult =
    payload.result ||
    (answered ? 'answered' : direction === 'inbound' ? 'missed' : 'no-answer')

  const record: CallRecord = {
    id: payload.callId || `hist-${Date.now()}`,
    number: payload.remoteNumber || existing?.remoteNumber || '',
    name: payload.remoteName || existing?.remoteName || payload.remoteNumber || existing?.remoteNumber || '',
    direction,
    result,
    duration: answered ? (payload.duration || existing?.duration || 0) : 0,
    timestamp: payload.timestamp || existing?.startTime || Date.now(),
    codec: payload.codec || existing?.codec,
  }

  if (!record.number) return
  useHistoryStore.getState().addRecord(record)
}

function AppContent() {
  const [page, setPage] = useState<Page>('dialpad')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const { setIncomingCall, setCallState, addCall, removeCall, updateCall } = useCallStore()
  const { t, isRtl } = useI18n()

  useEffect(() => {
    window.api.settings.get().then((value) => {
      setSettings(value as AppSettings)
    })
  }, [])

  const userAccess: UserAccessState = settings?.userAccess || {
    status: 'needs_login',
    profile: null,
    selectedExtensionId: '',
  }

  const persistUserAccess = async (next: UserAccessState) => {
    await window.api.settings.set('userAccess', next)
    setSettings((prev) => {
      if (!prev) return prev
      return { ...prev, userAccess: next }
    })
  }

  const handleLoginSuccess = async (profile: UserProfile) => {
    await persistUserAccess({
      status: 'logged_in',
      profile,
      selectedExtensionId: '',
    })
    setPage('dialpad')
  }

  const handleSkipLogin = async () => {
    await persistUserAccess({
      status: 'skipped',
      profile: null,
      selectedExtensionId: '',
    })
    setPage('dialpad')
  }

  const handleLogout = async () => {
    await persistUserAccess({
      status: 'needs_login',
      profile: null,
      selectedExtensionId: '',
    })
    setPage('dialpad')
  }

  const getSelectedExtension = (): ExtensionInfo | null => {
    return (
      getBuildMockExtensions().find(
        (item) => item.id === userAccess.selectedExtensionId
      ) || null
    )
  }

  const buildSipAccount = (
    extension: ExtensionInfo,
    existing?: SipAccount
  ): SipAccount => {
    return {
      id: existing?.id || `ext-${extension.id}`,
      displayName: extension.displayName,
      username: extension.extension,
      authUser: extension.extension,
      password: extension.password,
      domain: extension.host,
      sipServer: extension.host,
      sipProxy: existing?.sipProxy || '',
      transport: existing?.transport || 'udp',
      localPort: existing?.localPort || 5060,
      registerExpiry: existing?.registerExpiry || 300,
      stunServer: existing?.stunServer || '',
      codecs: existing?.codecs || ['PCMU', 'PCMA', 'opus'],
      enabled: true,
    }
  }

  const handleExtensionSelect = async (extension: ExtensionInfo) => {
    const currentSettings = (await window.api.settings.get()) as AppSettings
    const accounts = currentSettings.accounts || []
    const existing = accounts.find((item) => item.username === extension.extension)
    const account = buildSipAccount(extension, existing)

    if (existing) {
      await window.api.accounts.update(existing.id, account)
    } else {
      await window.api.accounts.add(account)
    }
    await window.api.accounts.setActive(account.id)
    await window.api.settings.set('activeAccountId', account.id)
    await window.api.sip.reconnect()

    const nextUserAccess: UserAccessState = {
      ...userAccess,
      status: 'logged_in',
      selectedExtensionId: extension.id,
    }
    await persistUserAccess(nextUserAccess)
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            accounts: existing
              ? prev.accounts.map((item) =>
                  item.id === account.id ? account : item
                )
              : [...prev.accounts, account],
            activeAccountId: account.id,
          }
        : prev
    )
    setPage('dialpad')
  }

  useEffect(() => {
    const api = window.api
    if (!api) return

    // Request notification permission on app load (incoming-call alerts)
    initNotifications()

    const onRegStatus = (...args: unknown[]) => {
      const info = args[0] as RegistrationInfo
      useSipStore.getState().setStatus(info.status, info.expires, info.errorMessage)
    }

    const onIncomingCall = (...args: unknown[]) => {
      const call = args[0] as CallInfo
      setIncomingCall(call)
      addCall(call)
      // OS-level notification with caller ID (background alerting)
      notifyIncomingCall(call)
    }

    const onOutgoingCall = (...args: unknown[]) => {
      const call = args[0] as CallInfo
      addCall(call)
    }

    const onCallState = async (...args: unknown[]) => {
      const data = args[0] as CallStatePayload
      const store = useCallStore.getState()
      let existing = store.calls.get(data.callId)

      if (data.call) {
        if (existing) {
          updateCall(data.callId, { ...data.call, state: data.state })
        } else {
          addCall({ ...data.call, state: data.state })
        }
        existing = useCallStore.getState().calls.get(data.callId)
      } else if (!existing) {
        try {
          const call = await api.sip.getCall(data.callId)
          if (call) {
            addCall({ ...call, state: data.state })
            existing = useCallStore.getState().calls.get(data.callId)
          }
        } catch {}
      } else {
        const patch: Partial<CallInfo> = { state: data.state }
        if (typeof data.answerTime === 'number') patch.answerTime = data.answerTime
        if (typeof data.isMuted === 'boolean') patch.isMuted = data.isMuted
        if (typeof data.isOnHold === 'boolean') patch.isOnHold = data.isOnHold
        if (typeof data.duration === 'number') patch.duration = data.duration
        updateCall(data.callId, patch)
        setCallState(data.callId, data.state)
      }

      if (data.state === 'ended') {
        const incoming = useCallStore.getState().incomingCall
        if (incoming?.id === data.callId) setIncomingCall(null)
        closeIncomingCallNotification()
        setTimeout(() => removeCall(data.callId), 1500)
      }
    }

    const onCallEnded = (...args: unknown[]) => {
      const data = args[0] as CallEndedPayload
      const existing = useCallStore.getState().calls.get(data.callId) || null
      const incoming = useCallStore.getState().incomingCall
      if (incoming?.id === data.callId) setIncomingCall(null)
      recordCallHistory(data, existing)
    }

    api.on('sip:registration-status', onRegStatus)
    api.on('sip:incoming-call', onIncomingCall)
    api.on('sip:outgoing-call', onOutgoingCall)
    api.on('sip:call-state', onCallState)
    api.on('sip:call-ended', onCallEnded)

    api.sip.start().then((result) => {
      if (!result.success) {
        useSipStore.getState().setStatus(
          'disconnected',
          0,
          result.error || t('app.notConnected')
        )
      }
    })

    return () => {
      api.off('sip:registration-status', onRegStatus)
      api.off('sip:incoming-call', onIncomingCall)
      api.off('sip:outgoing-call', onOutgoingCall)
      api.off('sip:call-state', onCallState)
      api.off('sip:call-ended', onCallEnded)
    }
  }, [t, setIncomingCall, setCallState, addCall, removeCall, updateCall])

  if (!settings) {
    return <div className="h-screen flex items-center justify-center text-sm text-text-muted">{t('settings.loading')}</div>
  }

  const showLoginSetup = userAccess.status === 'needs_login'
  const showExtensionSetup =
    userAccess.status === 'logged_in' && !userAccess.selectedExtensionId
  const selectedExtension = getSelectedExtension()

  return (
    <div className="h-screen overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      <PhoneFrame>
        {showLoginSetup ? (
          <SetupShell>
            <LoginGate
              allowSkip
              onSkip={() => void handleSkipLogin()}
              onLoginSuccess={(profile) => void handleLoginSuccess(profile)}
            />
          </SetupShell>
        ) : showExtensionSetup ? (
          <SetupShell>
            <ExtensionPicker
              onSelect={(extension) => void handleExtensionSelect(extension)}
            />
          </SetupShell>
        ) : (
          <AppShell page={page} onNavigate={(p) => setPage(p as Page)}>
            {page === 'dialpad' && (
              <PhoneTabs
                userAccess={userAccess}
                selectedExtensionId={userAccess.selectedExtensionId}
                onOpenProfile={() => setPage('profile')}
              />
            )}
            {page === 'contacts' && <ContactList />}
            {page === 'history' && <CallHistory />}
            {page === 'settings' && <Settings />}
            {page === 'profile' && (
              <ProfilePanel
                userAccess={userAccess}
                selectedExtension={selectedExtension}
                onLoginSuccess={(profile) => void handleLoginSuccess(profile)}
                onLogout={() => void handleLogout()}
                onSelectExtension={(extension) => void handleExtensionSelect(extension)}
              />
            )}
            {page === 'autofill' && <AutoFillForm />}
          </AppShell>
        )}
      </PhoneFrame>

      <ActiveCall />
      <IncomingCall />
      <CallAudio />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </ThemeProvider>
  )
}

function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-bg">
      <WindowHeader />
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
    </div>
  )
}
