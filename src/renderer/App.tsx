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
import { ExtensionChangeModal } from './components/auth/ExtensionChangeModal'
import { LoginGate } from './components/auth/LoginGate'
import { ClockGate } from './components/auth/ClockGate'
import { ShiftExpiryGuard } from './components/auth/ShiftExpiryGuard'
import { UpdateAvailableModal } from './components/settings/UpdateAvailableModal'
import { WindowHeader } from './components/layout/WindowHeader'
import { ProfilePanel } from './components/profile/ProfilePanel'
import { useSipStore } from './stores/sipStore'
import { useCallStore } from './stores/callStore'
import { useHistoryStore } from './stores/historyStore'
import { logoutExtension } from './lib/extensionsApi'
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
  recordingPath?: string
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
    recordingPath: payload.recordingPath,
  }

  if (!record.number) return
  useHistoryStore.getState().addRecord(record)
}

function AppContent() {
  const [page, setPage] = useState<Page>('dialpad')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [clockPassed, setClockPassed] = useState(false)
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false)
  const { setIncomingCall, setCallState, addCall, removeCall, updateCall } = useCallStore()
  const { t, isRtl } = useI18n()
  const calls = useCallStore((s) => s.calls)

  useEffect(() => {
    window.api.settings.get().then((value) => {
      setSettings(value as AppSettings)
    })
  }, [])

  const userAccess: UserAccessState = settings?.userAccess || {
    status: 'needs_login',
    profile: null,
    selectedExtensionId: '',
    reservedExtension: null,
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
      reservedExtension: null,
    })
    try {
      await window.api.socket.emitOperator()
    } catch {
      // Socket may be disabled / not running
    }
    setPage('dialpad')
  }

  const handleSkipLogin = async () => {
    await persistUserAccess({
      status: 'skipped',
      profile: null,
      selectedExtensionId: '',
      reservedExtension: null,
    })
    setPage('dialpad')
  }

  const handleSkipExtension = async () => {
    await persistUserAccess({
      ...userAccess,
      status: 'logged_in',
      selectedExtensionId: '__skipped__',
      reservedExtension: null,
    })
    setPage('dialpad')
  }

  const handleLogout = async () => {
    const reserved = userAccess.reservedExtension
    const nationalCode = userAccess.profile?.nationalCode
    const extensionNumber =
      reserved?.extension ||
      (userAccess.selectedExtensionId?.startsWith('ext-')
        ? userAccess.selectedExtensionId.slice(4)
        : userAccess.selectedExtensionId) ||
      ''
    const provinceId =
      reserved?.provinceId || userAccess.profile?.provinceId

    const callState = useCallStore.getState()
    for (const call of callState.calls.values()) {
      try {
        await window.api.sip.hangupCall(call.id)
      } catch {
        // Continue logout even if hangup fails.
      }
      callState.removeCall(call.id)
    }
    callState.setIncomingCall(null)
    closeIncomingCallNotification()

    try {
      await window.api.sip.unregister()
    } catch {
      // Continue logout even if unregister fails.
    }

    if (
      extensionNumber &&
      extensionNumber !== '__skipped__' &&
      nationalCode
    ) {
      try {
        await logoutExtension({
          nationalCode,
          extension: extensionNumber,
          provinceId: provinceId && provinceId > 0 ? provinceId : undefined,
        })
      } catch {
        // Always clear local state even if release request fails.
      }
    }

    // Remove the reserved SIP account so settings does not keep a released extension
    try {
      const currentSettings = (await window.api.settings.get()) as AppSettings
      const accountId =
        currentSettings.activeAccountId ||
        (extensionNumber ? `ext-${extensionNumber}` : '')
      const account = currentSettings.accounts?.find(
        (item) =>
          item.id === accountId ||
          item.username === reserved?.username ||
          item.username === extensionNumber
      )
      if (account) {
        await window.api.accounts.remove(account.id)
        setSettings((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            accounts: prev.accounts.filter((item) => item.id !== account.id),
            activeAccountId:
              prev.activeAccountId === account.id ? '' : prev.activeAccountId,
          }
        })
      }
    } catch {
      // Ignore account cleanup failures during logout.
    }

    await window.api.settings.set('authSession', null)
    await persistUserAccess({
      status: 'needs_login',
      profile: null,
      selectedExtensionId: '',
      reservedExtension: null,
    })
    setPage('dialpad')
  }

  const getSelectedExtension = (): ExtensionInfo | null => {
    if (
      !userAccess.selectedExtensionId ||
      userAccess.selectedExtensionId === '__skipped__'
    ) {
      return null
    }
    const reserved = userAccess.reservedExtension
    const account = settings?.accounts?.find(
      (item) =>
        item.id === `ext-${reserved?.extension || userAccess.selectedExtensionId}` ||
        item.username === reserved?.username ||
        item.username === userAccess.selectedExtensionId ||
        item.id === userAccess.selectedExtensionId
    )
    const extensionNumber =
      reserved?.extension ||
      account?.displayName ||
      userAccess.selectedExtensionId

    return {
      id: `ext-${extensionNumber}`,
      label: extensionNumber,
      province: userAccess.profile?.provinceTitle || '',
      provinceId: reserved?.provinceId || userAccess.profile?.provinceId,
      extension: extensionNumber,
      username: reserved?.username || account?.authUser || account?.username,
      host: reserved?.ip || account?.sipServer || '',
      password: reserved?.password || account?.password || '',
      displayName: extensionNumber,
      registeredElsewhere: false,
    }
  }

  const buildSipAccount = (
    extension: ExtensionInfo,
    existing?: SipAccount
  ): SipAccount => {
    const sipUsername = extension.username || extension.extension
    return {
      id: existing?.id || `ext-${extension.extension}`,
      displayName: extension.extension,
      username: sipUsername,
      authUser: sipUsername,
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

  const handleExtensionSelect = async (
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
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const extensionNumber = reservation?.extension || extension.extension
      const sipHost = String(reservation?.ip || extension.host || '').trim()
      const sipUsername = String(
        reservation?.username || extension.username || extensionNumber || ''
      ).trim()
      const sipPassword =
        reservation?.password !== undefined
          ? reservation.password
          : extension.password

      if (!extensionNumber) {
        return { success: false, error: 'شماره داخلی نامعتبر است' }
      }
      if (!sipHost || !sipUsername) {
        return {
          success: false,
          error:
            'اطلاعات SIP ناقص است (آدرس سرور یا نام کاربری خالی است). دوباره تلاش کنید یا داخلی دیگری انتخاب کنید.',
        }
      }

      const registeredExtension: ExtensionInfo = {
        ...extension,
        extension: extensionNumber,
        username: sipUsername,
        host: sipHost,
        password: sipPassword,
        displayName: extensionNumber,
      }

      const currentSettings = (await window.api.settings.get()) as AppSettings
      const accounts = currentSettings.accounts || []
      const existing = accounts.find(
        (item) =>
          item.id === `ext-${extensionNumber}` ||
          item.username === sipUsername ||
          item.username === extensionNumber
      )
      const account = buildSipAccount(registeredExtension, existing)

      if (existing) {
        await window.api.accounts.update(existing.id, account)
      } else {
        await window.api.accounts.add(account)
      }
      await window.api.accounts.setActive(account.id)
      await window.api.settings.set('activeAccountId', account.id)

      // Persist selection before SIP reconnect so the picker does not get stuck
      const nextUserAccess: UserAccessState = {
        ...userAccess,
        status: 'logged_in',
        selectedExtensionId: extensionNumber,
        reservedExtension: {
          extension: extensionNumber,
          provinceId:
            reservation?.provinceId ||
            extension.provinceId ||
            userAccess.profile?.provinceId ||
            0,
          reservationId: reservation?.reservationId,
          reservedAt: reservation?.reservedAt,
          ip: sipHost,
          username: sipUsername,
          password: sipPassword,
        },
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

      try {
        await window.api.sip.reconnect()
      } catch (err) {
        console.error('[extension] SIP reconnect failed after reserve', err)
      }

      setPage('dialpad')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[extension] select failed', err)
      return { success: false, error: message || 'خطا در انتخاب داخلی' }
    }
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

    if (clockPassed) {
      api.sip.start().then((result) => {
        if (!result.success) {
          useSipStore.getState().setStatus(
            'disconnected',
            0,
            result.error || t('app.notConnected')
          )
        }
      })
    }

    return () => {
      api.off('sip:registration-status', onRegStatus)
      api.off('sip:incoming-call', onIncomingCall)
      api.off('sip:outgoing-call', onOutgoingCall)
      api.off('sip:call-state', onCallState)
      api.off('sip:call-ended', onCallEnded)
    }
  }, [clockPassed, t, setIncomingCall, setCallState, addCall, removeCall, updateCall])

  if (!settings) {
    return <div className="h-screen flex items-center justify-center text-sm text-text-muted">{t('settings.loading')}</div>
  }

  if (!clockPassed) {
    return (
      <div className="h-screen overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
        <PhoneFrame>
          <SetupShell>
            <ClockGate onPassed={() => setClockPassed(true)} />
          </SetupShell>
        </PhoneFrame>
      </div>
    )
  }

  const showLoginSetup = userAccess.status === 'needs_login'
  const showExtensionSetup =
    userAccess.status === 'logged_in' &&
    !userAccess.selectedExtensionId
  const selectedExtension = getSelectedExtension()

  const hasActiveCall = Array.from(calls.values()).some(
    (c) =>
      c.state === 'active' ||
      c.state === 'holding' ||
      c.state === 'outgoing' ||
      c.state === 'ringing'
  )
  const canChangeExtension =
    userAccess.status === 'logged_in' &&
    Boolean(userAccess.profile?.provinceId) &&
    !hasActiveCall
  const extensionPickerBlockedReason = hasActiveCall
    ? t('status.extensionPickerBlockedCall')
    : userAccess.status !== 'logged_in' || !userAccess.profile?.provinceId
      ? t('status.extensionPickerUnavailable')
      : null

  const openExtensionPicker = () => {
    if (!canChangeExtension) return
    setExtensionPickerOpen(true)
  }

  const currentExtensionNumber =
    userAccess.reservedExtension?.extension ||
    (userAccess.selectedExtensionId &&
    userAccess.selectedExtensionId !== '__skipped__'
      ? userAccess.selectedExtensionId
      : '')

  return (
    <div className="h-screen overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      <ShiftExpiryGuard
        userAccess={userAccess}
        intervalMinutes={settings.shiftCheckIntervalMinutes ?? 10}
        onForceLogout={handleLogout}
      />
      <UpdateAvailableModal />
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
            {userAccess.profile?.provinceId ? (
              <ExtensionPicker
                provinceId={userAccess.profile.provinceId}
                provinceTitle={userAccess.profile.provinceTitle || ''}
                nationalCode={userAccess.profile.nationalCode || ''}
                onSelect={handleExtensionSelect}
                onSkip={() => void handleSkipExtension()}
              />
            ) : (
              <div className="rounded-3xl border border-warning/40 bg-warning/10 p-4 text-sm text-text max-w-md mx-auto space-y-3">
                <p>شناسه استان برای دریافت داخلی‌ها در دسترس نیست. دوباره وارد شوید.</p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSkipExtension()}
                    className="text-xs text-text-muted hover:text-text transition-colors"
                  >
                    {t('auth.skip')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="text-xs text-accent hover:underline"
                  >
                    {t('auth.logout')}
                  </button>
                </div>
              </div>
            )}
          </SetupShell>
        ) : (
          <AppShell
            page={page}
            onNavigate={(p) => setPage(p as Page)}
            canChangeExtension={canChangeExtension}
            onOpenExtensionPicker={openExtensionPicker}
            extensionPickerBlockedReason={extensionPickerBlockedReason}
          >
            {page === 'dialpad' && (
              <PhoneTabs
                userAccess={userAccess}
                selectedExtensionId={
                  userAccess.selectedExtensionId === '__skipped__'
                    ? ''
                    : userAccess.selectedExtensionId
                }
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
                onLogout={handleLogout}
                onSelectExtension={handleExtensionSelect}
                onSkipLogin={() => void handleSkipLogin()}
                onSkipExtension={() => void handleSkipExtension()}
                canChangeExtension={canChangeExtension}
                onOpenExtensionPicker={openExtensionPicker}
              />
            )}
            {page === 'autofill' && <AutoFillForm />}
          </AppShell>
        )}
      </PhoneFrame>

      {extensionPickerOpen &&
        userAccess.profile?.provinceId &&
        userAccess.profile.nationalCode && (
          <ExtensionChangeModal
            open={extensionPickerOpen}
            onClose={() => setExtensionPickerOpen(false)}
            provinceId={userAccess.profile.provinceId}
            provinceTitle={userAccess.profile.provinceTitle || ''}
            nationalCode={userAccess.profile.nationalCode}
            currentExtension={currentExtensionNumber}
            onSelect={handleExtensionSelect}
          />
        )}

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
