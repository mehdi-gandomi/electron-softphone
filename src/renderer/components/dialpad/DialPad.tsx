import { useState, useCallback } from 'react'
import { useCallStore } from '../../stores/callStore'
import { useSipStore } from '../../stores/sipStore'
import { formatNumber } from '../../lib/utils'
import type { CallInfo } from '../../../shared/types'

const digits = [
  { num: '1', letters: '' },
  { num: '2', letters: 'ABC' },
  { num: '3', letters: 'DEF' },
  { num: '4', letters: 'GHI' },
  { num: '5', letters: 'JKL' },
  { num: '6', letters: 'MNO' },
  { num: '7', letters: 'PQRS' },
  { num: '8', letters: 'TUV' },
  { num: '9', letters: 'WXYZ' },
  { num: '*', letters: '' },
  { num: '0', letters: '+' },
  { num: '#', letters: '' },
]

export function DialPad() {
  const [number, setNumber] = useState('')
  const [callError, setCallError] = useState<string | null>(null)
  const [calling, setCalling] = useState(false)
  const calls = useCallStore((s) => s.calls)
  const sipStatus = useSipStore((s) => s.status)
  const sipError = useSipStore((s) => s.errorMessage)
  const hasActiveCall = Array.from(calls.values()).some(
    (c) => c.state === 'active' || c.state === 'outgoing' || c.state === 'ringing' || c.state === 'connecting'
  )

  const handleDigit = useCallback((digit: string) => {
    setNumber((prev) => prev + digit)
    setCallError(null)
  }, [])

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setNumber('')
    setCallError(null)
  }, [])

  const handleCall = useCallback(async () => {
    if (!number.trim() || calling) return
    setCallError(null)
    setCalling(true)
    try {
      const result = await window.api.sip.makeCall(number.trim())
      if (!result.success) {
        setCallError(result.error || 'Call failed')
      } else {
        // Ensure UI shows even if the IPC event is missed
        if (result.callId) {
          const call = await window.api.sip.getCall(result.callId)
          if (call) {
            useCallStore.getState().addCall(call as CallInfo)
          }
        }
        setNumber('')
      }
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : String(err))
    } finally {
      setCalling(false)
    }
  }, [number, calling])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleDigit(e.key)
    } else if (e.key === 'Backspace') {
      handleBackspace()
    } else if (e.key === 'Enter') {
      handleCall()
    } else if (e.key === 'Escape') {
      handleClear()
    }
  }, [handleDigit, handleBackspace, handleCall, handleClear])

  const canCall = !!number.trim() && !hasActiveCall && !calling

  return (
    <div className="flex flex-col items-center gap-6 py-4" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Registration / call errors */}
      {(sipStatus === 'failed' || sipStatus === 'disconnected') && sipError && (
        <div className="w-full max-w-[320px] px-3 py-2 rounded-xl bg-error/10 border border-error/30 text-error text-xs text-center">
          {sipError}
        </div>
      )}
      {sipStatus === 'connecting' && (
        <div className="w-full max-w-[320px] px-3 py-2 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs text-center">
          Registering with SIP server...
        </div>
      )}
      {callError && (
        <div className="w-full max-w-[320px] px-3 py-2 rounded-xl bg-error/10 border border-error/30 text-error text-xs text-center">
          {callError}
        </div>
      )}

      {/* Number display */}
      <div className="w-full text-center">
        <div className="min-h-[48px] flex items-center justify-center">
          <span className="text-3xl font-mono font-medium tracking-wider text-text break-all">
            {number ? formatNumber(number) : (
              <span className="text-text-muted text-lg">Enter number</span>
            )}
          </span>
        </div>
        {number && (
          <button
            onClick={handleClear}
            className="text-xs text-text-muted hover:text-text-secondary mt-1 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Numpad grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {digits.map(({ num, letters }) => (
          <button
            key={num}
            onClick={() => handleDigit(num)}
            className="group relative h-16 rounded-2xl bg-bg-surface hover:bg-bg-surface-2 border border-border hover:border-border-hover flex flex-col items-center justify-center transition-all duration-150 active:scale-95"
          >
            <span className="text-xl font-medium text-text group-hover:text-accent transition-colors">
              {num}
            </span>
            {letters && (
              <span className="text-[10px] text-text-muted tracking-[0.2em] mt-0.5">
                {letters}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Call button */}
      <div className="flex items-center gap-4">
        {number && (
          <button
            onClick={handleBackspace}
            className="w-14 h-14 rounded-full bg-bg-surface hover:bg-bg-surface-2 border border-border flex items-center justify-center transition-all duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-secondary">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/>
              <line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          </button>
        )}

        <button
          onClick={handleCall}
          disabled={!canCall}
          title={
            sipStatus !== 'registered'
              ? 'Register with SIP server first (see Settings → Debug)'
              : undefined
          }
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
            canCall
              ? 'bg-success hover:bg-emerald-500 glow-success active:scale-95'
              : 'bg-bg-surface-2 text-text-muted cursor-not-allowed'
          }`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>

        {number && (
          <div className="w-14" />
        )}
      </div>

      {sipStatus !== 'registered' && (
        <p className="text-[11px] text-text-muted text-center max-w-[280px]">
          Status: {sipStatus}. Open Settings → Debug to see SIP errors, or Settings → Account to reconnect.
        </p>
      )}
    </div>
  )
}
