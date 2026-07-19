import { useState, useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { DialPad } from './components/dialpad/DialPad'
import { ContactList } from './components/contacts/ContactList'
import { CallHistory } from './components/history/CallHistory'
import { Settings } from './components/settings/Settings'
import { AutoFillForm } from './components/autofill/AutoFillForm'
import { ActiveCall } from './components/call/ActiveCall'
import { IncomingCall } from './components/call/IncomingCall'
import { CallAudio } from './components/call/CallAudio'
import { useSipStore } from './stores/sipStore'
import { useCallStore } from './stores/callStore'
import { useHistoryStore } from './stores/historyStore'
import type { RegistrationInfo, CallInfo, CallState, CallRecord, CallResult } from '../shared/types'

type Page = 'dialpad' | 'contacts' | 'history' | 'settings' | 'autofill'

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

export default function App() {
  const [page, setPage] = useState<Page>('dialpad')
  const { setIncomingCall, setCallState, addCall, removeCall, updateCall } = useCallStore()

  useEffect(() => {
    const api = window.api
    if (!api) return

    const onRegStatus = (...args: unknown[]) => {
      const info = args[0] as RegistrationInfo
      useSipStore.getState().setStatus(info.status, info.expires, info.errorMessage)
    }

    const onIncomingCall = (...args: unknown[]) => {
      const call = args[0] as CallInfo
      setIncomingCall(call)
      addCall(call)
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
          result.error || 'Not connected. Add a SIP account in Settings.'
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
  }, [])

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <AppShell page={page} onNavigate={(p) => setPage(p as Page)}>
        {page === 'dialpad' && <DialPad />}
        {page === 'contacts' && <ContactList />}
        {page === 'history' && <CallHistory />}
        {page === 'settings' && <Settings />}
        {page === 'autofill' && <AutoFillForm />}
      </AppShell>

      <ActiveCall />
      <IncomingCall />
      <CallAudio />
    </div>
  )
}
