import { useState, useCallback, type KeyboardEvent } from 'react'
import { Phone, Delete } from 'lucide-react'
import { useCallStore } from '../../stores/callStore'
import { useSipStore } from '../../stores/sipStore'
import { useI18n } from '../../lib/i18n'
import { formatNumber } from '../../lib/utils'
import type { CallInfo } from '../../../shared/types'

const FA_DIGITS: Record<string, string> = {
  '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
  '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
  '*': '*', '#': '#',
}

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
  const { t, locale } = useI18n()
  const [number, setNumber] = useState('')
  const [calling, setCalling] = useState(false)
  const calls = useCallStore((s) => s.calls)
  const sipStatus = useSipStore((s) => s.status)
  const setActionError = useSipStore((s) => s.setActionError)
  const hasActiveCall = Array.from(calls.values()).some(
    (c) => c.state === 'active' || c.state === 'outgoing' || c.state === 'ringing' || c.state === 'connecting'
  )

  const handleDigit = useCallback((digit: string) => {
    setNumber((prev) => prev + digit)
  }, [])

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setNumber('')
  }, [])

  const handleCall = useCallback(async () => {
    if (!number.trim() || calling) return
    setCalling(true)
    try {
      const result = await window.api.sip.makeCall(number.trim())
      if (!result.success) {
        setActionError(result.error || t('dialpad.callFailed'))
      } else {
        setActionError(null)
        if (result.callId) {
          const call = await window.api.sip.getCall(result.callId)
          if (call) {
            useCallStore.getState().addCall(call as CallInfo)
          }
        }
        setNumber('')
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCalling(false)
    }
  }, [number, calling, setActionError, t])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleDigit(e.key)
    } else if (e.key === 'Backspace') {
      handleBackspace()
    } else if (e.key === 'Enter') {
      handleCall()
    } else if (e.key === 'Escape') {
      handleClear()
    } else if (e.key === '*' || e.key === '#') {
      handleDigit(e.key)
    }
  }, [handleDigit, handleBackspace, handleCall, handleClear])

  const canCall = !!number.trim() && !hasActiveCall && !calling
  const displayDigit = (num: string) => (locale === 'fa' ? (FA_DIGITS[num] || num) : num)

  return (
    <div
      className="h-full flex flex-col items-center justify-start gap-1.5 pt-4 pb-0 overflow-hidden"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Number display + backspace */}
      <div className="w-full max-w-[260px] flex-shrink-0">
        <div className="min-h-[36px] flex items-center gap-1.5">
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <span className="text-[1.4rem] font-semibold tracking-wide text-text break-all leading-tight text-center" dir="ltr">
              {number ? formatNumber(number) : (
                <span className="text-text-muted text-[13px] font-normal">{t('dialpad.placeholder')}</span>
              )}
            </span>
          </div>
          <button
            onClick={handleBackspace}
            disabled={!number}
            className={`w-9 h-9 flex-shrink-0 rounded-full border border-border flex items-center justify-center transition-all ${
              number ? 'dial-key text-text-secondary hover:text-text' : 'opacity-25 cursor-default'
            }`}
            aria-label={t('dialpad.backspace')}
            title={t('dialpad.backspace')}
          >
            <Delete size={16} />
          </button>
        </div>
      </div>

      {/* Dialpad */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-[260px] content-center">
        {digits.map(({ num, letters }) => (
          <button
            key={num}
            onClick={() => handleDigit(num)}
            className="dial-key group relative h-[2.85rem] rounded-xl border border-border hover:border-accent/40 flex flex-col items-center justify-center active:scale-95 shadow-sm"
          >
            <span className="text-lg font-semibold text-text tabular-nums leading-none">
              {displayDigit(num)}
            </span>
            {letters && (
              <span className="text-[7px] text-text-muted tracking-[0.12em] mt-0.5">
                {letters}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Call icon — tight under dialpad */}
      <button
        onClick={handleCall}
        disabled={!canCall}
        title={
          sipStatus !== 'registered'
            ? t('dialpad.registerFirst')
            : t('dialpad.call')
        }
        aria-label={t('dialpad.call')}
        className={`w-14 h-14 mt-0.5 rounded-full flex items-center justify-center transition-all duration-200 ${
          canCall
            ? 'bg-success hover:bg-emerald-700 text-white glow-success active:scale-95'
            : 'bg-bg-surface-2 text-text-muted cursor-not-allowed border border-border'
        }`}
      >
        <Phone size={26} fill={canCall ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
