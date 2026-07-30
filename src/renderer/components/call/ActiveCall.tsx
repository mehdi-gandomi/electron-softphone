import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useCallStore } from '../../stores/callStore'
import { useI18n } from '../../lib/i18n'
import { formatDuration } from '../../lib/utils'
import type { CallInfo } from '../../../shared/types'

export function ActiveCall() {
  const calls = useCallStore((s) => s.calls)
  const activeCall = Array.from(calls.values()).find(
    (c) => c.state === 'active' || c.state === 'holding' || c.state === 'connecting' || c.state === 'outgoing' || c.state === 'ringing'
  )

  if (!activeCall) return null

  return <ActiveCallPanel call={activeCall} />
}

function ActiveCallPanel({ call }: { call: CallInfo }) {
  const { t, isRtl } = useI18n()
  const [duration, setDuration] = useState(0)
  const [showDtmf, setShowDtmf] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const onTransfer = (...args: unknown[]) => {
      const data = args[0] as { callId: string; status: string; message?: string }
      if (data.callId !== call.id) return
      if (data.status === 'started' || data.status === 'accepted' || data.status === 'progress') {
        setTransferStatus(
          data.message
            ? t('call.transferringWithMsg', { message: data.message })
            : t('call.transferring')
        )
      } else if (data.status === 'failed') {
        setTransferStatus(data.message || t('call.transferFailed'))
        setTimeout(() => setTransferStatus(null), 4000)
      } else if (data.status === 'complete') {
        setTransferStatus(t('call.transferComplete'))
      }
    }
    window.api.on('sip:transfer-status', onTransfer)
    return () => window.api.off('sip:transfer-status', onTransfer)
  }, [call.id, t])

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (call.state === 'active' || call.state === 'holding') {
      const base = call.answerTime || call.startTime
      const tick = () => setDuration(Math.max(0, Math.floor((Date.now() - base) / 1000)))
      tick()
      timerRef.current = setInterval(tick, 1000)
    } else {
      setDuration(0)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [call.state, call.answerTime, call.startTime])

  const handleMute = useCallback(() => {
    window.api.sip.muteCall(call.id, !call.isMuted)
  }, [call.id, call.isMuted])

  const handleHold = useCallback(() => {
    if (call.isOnHold || call.state === 'holding') {
      window.api.sip.unholdCall(call.id)
    } else {
      window.api.sip.holdCall(call.id)
    }
  }, [call.id, call.isOnHold, call.state])

  const handleHangup = useCallback(() => {
    window.api.sip.hangupCall(call.id)
  }, [call.id])

  const handleDtmf = useCallback((digit: string) => {
    window.api.sip.sendDtmf(call.id, digit)
  }, [call.id])

  const handleTransfer = useCallback(() => {
    if (transferTarget.trim()) {
      setTransferStatus(t('call.transferring'))
      window.api.sip.transferCall(call.id, transferTarget.trim())
      setShowTransfer(false)
      setTransferTarget('')
    }
  }, [call.id, transferTarget, t])

  const stateLabel =
    transferStatus ? transferStatus :
    call.state === 'holding' ? t('call.onHold', { duration: formatDuration(duration) }) :
    call.state === 'active' ? formatDuration(duration) :
    call.state === 'outgoing' ? t('call.calling') :
    call.state === 'ringing' ? t('call.ringing') :
    call.state === 'connecting' ? t('call.connecting') :
    call.state

  const displayName = call.remoteName || call.remoteNumber
  const onHold = call.isOnHold || call.state === 'holding'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in p-3" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="w-[380px] max-w-[92vw] bg-bg-surface emergency-panel rounded-3xl p-6 shadow-2xl animate-scale-in">
        <div className="text-center mb-1">
          <p className="text-[11px] text-accent font-semibold mb-2">{t('call.activeTitle')}</p>
          <h2 className="text-2xl font-bold text-text tracking-wide" dir="ltr">{call.remoteNumber}</h2>
          {call.remoteName && call.remoteName !== call.remoteNumber && (
            <p className="text-sm text-text-secondary mt-1">{displayName}</p>
          )}
        </div>
        <p className={`text-center text-sm font-mono mb-6 ${
          call.state === 'active' ? 'text-success' :
          call.state === 'holding' ? 'text-warning' :
          'text-accent'
        }`}>
          {stateLabel}
        </p>

        {showDtmf && (
          <div className="mb-5 p-3 bg-bg rounded-xl animate-slide-up border border-border">
            <div className="grid grid-cols-4 gap-2">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDtmf(d)}
                  className="h-10 rounded-lg dial-key border border-border text-text font-mono text-sm transition-colors active:scale-95"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {showTransfer && (
          <div className="mb-5 p-3 bg-bg rounded-xl animate-slide-up border border-border">
            <input
              type="text"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              placeholder={t('call.transferPlaceholder')}
              className="input-field text-sm mb-2"
              autoFocus
              dir="ltr"
            />
            <div className="flex gap-2">
              <button onClick={handleTransfer} className="btn-primary text-sm flex-1">{t('call.transfer')}</button>
              <button onClick={() => setShowTransfer(false)} className="btn-ghost text-sm">{t('call.cancel')}</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 mb-5">
          <ControlButton
            active={call.isMuted}
            onClick={handleMute}
            label={t('call.mute')}
            icon={
              call.isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )
            }
          />
          <ControlButton
            active={onHold}
            onClick={handleHold}
            label={t('call.hold')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            }
          />
          <ControlButton
            active={showDtmf}
            onClick={() => setShowDtmf(!showDtmf)}
            label={t('call.keypad')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="4" height="4" rx="1"/>
                <rect x="10" y="2" width="4" height="4" rx="1"/>
                <rect x="16" y="2" width="4" height="4" rx="1"/>
                <rect x="4" y="8" width="4" height="4" rx="1"/>
                <rect x="10" y="8" width="4" height="4" rx="1"/>
                <rect x="16" y="8" width="4" height="4" rx="1"/>
                <rect x="4" y="14" width="16" height="4" rx="1"/>
              </svg>
            }
          />
          <ControlButton
            active={!!transferStatus || showTransfer}
            onClick={() => {
              if (transferStatus && !transferStatus.toLowerCase().includes('fail') && !transferStatus.includes('ناموفق')) return
              setShowTransfer(!showTransfer)
            }}
            label={t('call.transfer')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            }
          />
        </div>

        <button
          onClick={handleHangup}
          className="w-full h-14 rounded-2xl bg-error hover:bg-red-700 text-white font-semibold text-base transition-all duration-200 glow-error active:scale-95 flex items-center justify-center gap-2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10.68 13.31a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 24 20.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07"/>
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          {t('call.hangup')}
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, onClick, label, icon }: {
  active: boolean
  onClick: () => void
  label: string
  icon: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-150 ${
        active
          ? 'bg-accent/15 text-accent border border-accent/30'
          : 'bg-bg-surface-2 hover:bg-bg-surface-3 text-text-secondary border border-border'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
