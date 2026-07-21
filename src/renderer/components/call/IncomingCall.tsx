import { useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useCallStore } from '../../stores/callStore'

export function IncomingCall() {
  const incomingCall = useCallStore((s) => s.incomingCall)
  const setIncomingCall = useCallStore((s) => s.setIncomingCall)
  const ringCtxRef = useRef<AudioContext | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const stopRingtone = useCallback(() => {
    if (ringTimerRef.current) {
      clearInterval(ringTimerRef.current)
      ringTimerRef.current = null
    }
    if (ringCtxRef.current) {
      ringCtxRef.current.close().catch(() => {})
      ringCtxRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const startClassicBeep = useCallback((volume: number) => {
    const ctx = new AudioContext()
    ringCtxRef.current = ctx
    const gainLevel = Math.max(0.05, Math.min(1, volume)) * 0.2

    const beep = () => {
      if (!ringCtxRef.current) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 440
      gain.gain.value = gainLevel
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime
      gain.gain.setValueAtTime(gainLevel, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      osc.start(t)
      osc.stop(t + 0.4)

      setTimeout(() => {
        if (!ringCtxRef.current) return
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.frequency.value = 480
        gain2.gain.value = gainLevel
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        const t2 = ctx.currentTime
        gain2.gain.setValueAtTime(gainLevel, t2)
        gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.4)
        osc2.start(t2)
        osc2.stop(t2 + 0.4)
      }, 450)
    }

    beep()
    ringTimerRef.current = setInterval(beep, 2000)
  }, [])

  const startFileRingtone = useCallback(async (dataUrl: string, volume: number) => {
    const audio = new Audio(dataUrl)
    audio.loop = true
    audio.volume = Math.max(0, Math.min(1, volume))
    audioRef.current = audio
    try {
      await audio.play()
    } catch {
      // Autoplay / decode failure — fall back to classic
      stopRingtone()
      startClassicBeep(volume)
    }
  }, [startClassicBeep, stopRingtone])

  const startRingtone = useCallback(async () => {
    stopRingtone()
    try {
      const settings = (await window.api.settings.get()) as {
        ringtonePreset?: string
        ringtonePath?: string
        ringtoneVolume?: number
      }
      const volume = typeof settings.ringtoneVolume === 'number' ? settings.ringtoneVolume : 0.7
      const preset = settings.ringtonePreset || 'classic'
      const customPath = settings.ringtonePath || ''

      if (preset === 'classic') {
        startClassicBeep(volume)
        return
      }

      const filePath = await window.api.ringtone.resolve(preset, customPath)
      if (!filePath) {
        startClassicBeep(volume)
        return
      }

      const result = await window.api.ringtone.readDataUrl(filePath)
      if (!result.success || !result.dataUrl) {
        startClassicBeep(volume)
        return
      }
      await startFileRingtone(result.dataUrl, volume)
    } catch {
      startClassicBeep(0.7)
    }
  }, [startClassicBeep, startFileRingtone, stopRingtone])

  useEffect(() => {
    if (incomingCall) {
      startRingtone()
      const timer = setTimeout(() => {
        handleReject()
      }, 30000)
      return () => {
        clearTimeout(timer)
        stopRingtone()
      }
    }
  }, [incomingCall])

  const handleAnswer = useCallback(async () => {
    if (!incomingCall) return
    const id = incomingCall.id
    stopRingtone()
    setIncomingCall(null)
    const result = await window.api.sip.answerCall(id)
    if (result && 'success' in result && !result.success) {
      console.error('answerCall failed', result)
    }
  }, [incomingCall, setIncomingCall, stopRingtone])

  const handleReject = useCallback(async () => {
    if (!incomingCall) return
    stopRingtone()
    await window.api.sip.hangupCall(incomingCall.id)
    setIncomingCall(null)
  }, [incomingCall, setIncomingCall, stopRingtone])

  if (!incomingCall) return null

  const displayName = incomingCall.remoteName || incomingCall.remoteNumber

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <motion.div
        className="w-[380px] max-w-[92vw] bg-bg-surface border border-border rounded-3xl p-8 shadow-2xl"
        initial={{ y: 12, opacity: 0, scale: 1 }}
        animate={{ y: 0, opacity: 1, scale: [1, 1.015, 1] }}
        transition={{
          y: { duration: 0.25, ease: 'easeOut' },
          opacity: { duration: 0.25 },
          scale: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center text-3xl font-bold text-accent">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -inset-3 rounded-full border-2 border-accent/40 animate-ring" />
            <div className="absolute -inset-3 rounded-full border-2 border-accent/20 animate-ring" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>

        <div className="text-center mb-2">
          <p className="text-xs text-text-muted tracking-wider mb-2">تماس ورودی</p>
          <h2 className="text-xl font-semibold text-text">{displayName}</h2>
          {incomingCall.remoteName && (
            <p className="text-sm text-text-secondary mt-0.5">{incomingCall.remoteNumber}</p>
          )}
        </div>

        <div className="mt-6 mb-8 p-3 bg-bg rounded-xl border border-border">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">شماره تماس‌گیرنده:</span>
              <p className="text-text font-mono" dir="ltr">{incomingCall.remoteNumber}</p>
            </div>
            <div>
              <span className="text-text-muted">داخلی:</span>
              <p className="text-text font-mono" dir="ltr">{incomingCall.localNumber}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 justify-center">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleReject}
              className="w-20 h-20 rounded-full bg-error hover:bg-red-600 flex items-center justify-center transition-all duration-200 glow-error active:scale-90"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                <line x1="1" y1="1" x2="23" y2="23" strokeWidth="3"/>
              </svg>
            </button>
            <span className="text-sm font-medium text-text-secondary">رد تماس</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAnswer}
              className="w-20 h-20 rounded-full bg-success hover:bg-emerald-500 flex items-center justify-center transition-all duration-200 glow-success active:scale-90"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
            <span className="text-sm font-medium text-text-secondary">پاسخ</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
