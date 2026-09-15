import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, Volume2, VolumeX, AlertCircle, X, Phone } from 'lucide-react'
import { useSipStore } from '../../stores/sipStore'
import { useCallStore } from '../../stores/callStore'
import { useI18n } from '../../lib/i18n'
import { deviceLabel, listAudioDevices, normalizeDeviceId } from '../../lib/audioDevices'
import { AudioDevicePanel } from '../settings/AudioDevicePanel'
import { Slider } from '../ui/slider'

interface BottomStatusBarProps {
  canChangeExtension?: boolean
  onOpenExtensionPicker?: () => void
  extensionPickerBlockedReason?: string | null
}

export function BottomStatusBar({
  canChangeExtension = false,
  onOpenExtensionPicker,
  extensionPickerBlockedReason = null,
}: BottomStatusBarProps) {
  const { t, isRtl } = useI18n()
  const sipStatus = useSipStore((s) => s.status)
  const errorMessage = useSipStore((s) => s.errorMessage)
  const actionError = useSipStore((s) => s.actionError)
  const setActionError = useSipStore((s) => s.setActionError)
  const calls = useCallStore((s) => s.calls)
  const activeCalls = Array.from(calls.values()).filter(
    (c) => c.state === 'active' || c.state === 'holding' || c.state === 'outgoing' || c.state === 'ringing'
  )

  const [volume, setVolume] = useState(100)
  const [micVolume, setMicVolume] = useState(100)
  const [inputDevice, setInputDevice] = useState('')
  const [outputDevice, setOutputDevice] = useState('')
  const [deviceName, setDeviceName] = useState(() => t('status.defaultDevice'))
  const [errorOpen, setErrorOpen] = useState(false)
  const [devicePickerOpen, setDevicePickerOpen] = useState(false)
  const [devicePickerFocus, setDevicePickerFocus] = useState<'input' | 'output'>('output')
  const [pickerHint, setPickerHint] = useState('')
  const [socketRunning, setSocketRunning] = useState(false)
  const [socketReachable, setSocketReachable] = useState(false)
  const [socketUrl, setSocketUrl] = useState('http://127.0.0.1:3920')
  const [socketDetail, setSocketDetail] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const devicePickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    const pollSocket = async () => {
      try {
        const status = await window.api.socket.status()
        if (cancelled) return
        setSocketRunning(Boolean(status.running))
        setSocketReachable(Boolean(status.reachable))
        setSocketUrl(status.url || `http://127.0.0.1:${status.port || 3920}`)
        setSocketDetail(status.detail || '')
      } catch {
        if (!cancelled) {
          setSocketRunning(false)
          setSocketReachable(false)
        }
      }
    }

    void pollSocket()
    const interval = setInterval(() => {
      void pollSocket()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const settings = (await window.api.settings.get()) as {
          speakerVolume?: number
          micVolume?: number
          outputDevice?: string
          inputDevice?: string
        }
        if (cancelled) return
        if (typeof settings.speakerVolume === 'number') {
          setVolume(Math.round(settings.speakerVolume * 100))
        }
        if (typeof settings.micVolume === 'number') {
          setMicVolume(Math.round(settings.micVolume * 100))
        }

        const nextInput = normalizeDeviceId(settings.inputDevice)
        const nextOutput = normalizeDeviceId(settings.outputDevice)
        setInputDevice(nextInput)
        setOutputDevice(nextOutput)

        try {
          const { outputs } = await listAudioDevices()
          if (cancelled) return
          const selected = outputs.find((d) => d.deviceId === nextOutput)
          setDeviceName(
            selected
              ? deviceLabel(selected, t('status.defaultDevice'))
              : t('status.defaultDevice')
          )
        } catch {
          setDeviceName(t('status.defaultDevice'))
        }
      } catch {
        /* keep defaults */
      }
    }

    load()
    navigator.mediaDevices?.addEventListener?.('devicechange', load)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', load)
    }
  }, [t])

  const handleVolume = (vals: number[]) => {
    const v = vals[0]
    setVolume(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.settings.set('speakerVolume', v / 100)
    }, 250)
  }

  const handleMic = (vals: number[]) => {
    const v = vals[0]
    setMicVolume(v)
    window.api.settings.set('micVolume', v / 100)
  }

  const tryOpenExtensionPicker = () => {
    setPickerHint('')
    if (extensionPickerBlockedReason) {
      setPickerHint(extensionPickerBlockedReason)
      return
    }
    if (!canChangeExtension || !onOpenExtensionPicker) {
      setPickerHint(t('status.extensionPickerUnavailable'))
      return
    }
    onOpenExtensionPicker()
  }

  const openDevicePicker = (focus: 'input' | 'output') => {
    if (devicePickerOpen && devicePickerFocus === focus) {
      setDevicePickerOpen(false)
      return
    }
    setDevicePickerFocus(focus)
    setDevicePickerOpen(true)
  }

  const refreshOutputLabel = async (deviceId: string) => {
    const id = normalizeDeviceId(deviceId)
    if (!id) {
      setDeviceName(t('status.defaultDevice'))
      return
    }
    try {
      const { outputs } = await listAudioDevices()
      const selected = outputs.find((d) => d.deviceId === id)
      setDeviceName(
        selected
          ? deviceLabel(selected, t('status.defaultDevice'))
          : t('status.defaultDevice')
      )
    } catch {
      setDeviceName(t('status.defaultDevice'))
    }
  }

  const handleSelectInput = (deviceId: string) => {
    const id = normalizeDeviceId(deviceId)
    setInputDevice(id)
    void window.api.settings.set('inputDevice', id)
  }

  const handleSelectOutput = (deviceId: string) => {
    const id = normalizeDeviceId(deviceId)
    setOutputDevice(id)
    void window.api.settings.set('outputDevice', id)
    void refreshOutputLabel(id)
  }

  useEffect(() => {
    if (!devicePickerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDevicePickerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [devicePickerOpen])

  const VolumeIcon = volume === 0 ? VolumeX : Volume2

  const online = sipStatus === 'registered'
  const connecting = sipStatus === 'connecting'
  const detailError =
    actionError ||
    errorMessage ||
    (online
      ? null
      : connecting
        ? t('status.connectingDetail')
        : t('status.offlineDetail'))

  const statusLabel = online ? t('status.online') : connecting ? t('status.connecting') : t('status.offline')
  const canOpenError = !online || !!actionError || !!errorMessage

  const openError = () => {
    if (!canOpenError || !detailError) return
    setErrorOpen(true)
  }

  return (
    <>
      <div className="h-8 px-2 flex items-center gap-2 text-[10px] border-t border-border bg-bg-surface flex-shrink-0">
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={openError}
            disabled={!canOpenError}
            className={`flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors ${
              canOpenError ? 'hover:bg-error/10 cursor-pointer' : 'cursor-default'
            }`}
            title={canOpenError ? t('status.clickForDetails') : t('status.sipConnected')}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              online ? 'bg-success' : connecting ? 'bg-warning' : 'bg-error'
            }`} />
            <span className={`font-medium ${
              online ? 'text-success' : connecting ? 'text-warning' : 'text-error'
            }`}>
              {statusLabel}
            </span>
            {!online && <AlertCircle size={11} className="text-error opacity-80" />}
          </button>

          <button
            type="button"
            onClick={tryOpenExtensionPicker}
            className="w-5 h-5 rounded-md hover-overlay text-text-muted hover:text-accent flex items-center justify-center"
            title={t('status.openExtensionPicker')}
            aria-label={t('status.openExtensionPicker')}
          >
            <Phone size={11} />
          </button>
        </div>

        <span
          className={`flex items-center gap-1 flex-shrink-0 rounded-md px-1 py-0.5 ${
            socketReachable
              ? 'text-success'
              : socketRunning
                ? 'text-warning'
                : 'text-text-muted'
          }`}
          title={
            socketReachable
              ? t('status.socketRunning', { url: socketUrl })
              : socketRunning
                ? t('status.socketBlocked', { detail: socketDetail || 'firewall?' })
                : t('status.socketStopped')
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              socketReachable
                ? 'bg-success'
                : socketRunning
                  ? 'bg-warning'
                  : 'bg-text-muted/50'
            }`}
          />
          <span className="font-medium">{t('status.socket')}</span>
        </span>

        <div className="flex items-center gap-1 min-w-0 flex-1 text-text-muted">
          <button
            type="button"
            onClick={() => openDevicePicker('output')}
            className="flex items-center gap-1 min-w-0 rounded-md px-1 py-0.5 hover-overlay text-text-muted hover:text-accent"
            title={t('status.selectDevice')}
            aria-label={t('status.selectDevice')}
          >
            <Headphones size={11} className="flex-shrink-0 text-accent" />
            <span className="truncate" dir="ltr" title={deviceName}>{deviceName}</span>
          </button>
          {activeCalls.length > 0 && (
            <span className="text-accent font-medium flex-shrink-0">{t('status.activeCalls', { count: activeCalls.length })}</span>
          )}
          {pickerHint && (
            <span className="text-error truncate flex-shrink min-w-0" title={pickerHint}>
              {pickerHint}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 w-[140px]">
          <div className="flex items-center gap-0.5 flex-1" title={t('status.volume')}>
            <button
              type="button"
              onClick={() => openDevicePicker('output')}
              className="flex-shrink-0 rounded-md p-0.5 hover-overlay text-text-muted hover:text-accent"
              title={t('status.selectDevice')}
              aria-label={t('status.selectDevice')}
            >
              <VolumeIcon size={11} />
            </button>
            <Slider value={[volume]} onValueChange={handleVolume} min={0} max={100} step={1} />
          </div>
          <div className="flex items-center gap-0.5 flex-1" title={t('status.mic')}>
            <button
              type="button"
              onClick={() => openDevicePicker('input')}
              className="flex-shrink-0 rounded-md p-0.5 hover-overlay text-text-muted hover:text-accent"
              title={t('status.selectDevice')}
              aria-label={t('status.selectDevice')}
            >
              <Mic size={11} />
            </button>
            <Slider value={[micVolume]} onValueChange={handleMic} min={0} max={100} step={1} />
          </div>
        </div>
      </div>

      {devicePickerOpen && (
        <>
          <div
            className="fixed inset-0 bottom-8 z-[54]"
            onClick={() => setDevicePickerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={devicePickerRef}
            className="fixed z-[55] w-[300px] max-w-[calc(100vw-16px)] max-h-[min(420px,calc(100vh-56px))] overflow-y-auto bg-bg-surface border border-border rounded-2xl p-3 shadow-2xl animate-scale-in"
            style={{
              bottom: 40,
              ...(isRtl ? { left: 8 } : { right: 8 }),
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t('status.selectDevice')}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-text">{t('status.selectDevice')}</h3>
            <button
              type="button"
              onClick={() => setDevicePickerOpen(false)}
              className="w-6 h-6 rounded-lg hover-overlay text-text-muted flex items-center justify-center"
              aria-label={t('status.close')}
            >
              <X size={14} />
            </button>
          </div>
          <AudioDevicePanel
            variant="popover"
            inputDevice={inputDevice}
            outputDevice={outputDevice}
            speakerVolume={volume / 100}
            focus={devicePickerFocus}
            onSelectInput={handleSelectInput}
            onSelectOutput={handleSelectOutput}
          />
          </div>
        </>
      )}

      {errorOpen && detailError && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm p-4"
          style={{ backgroundColor: 'var(--overlay-backdrop)' }}
          onClick={() => setErrorOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-error-title"
        >
          <div
            className="w-full max-w-[320px] bg-bg-surface border border-error/40 rounded-2xl p-4 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-error">
                <AlertCircle size={20} />
                <h3 id="status-error-title" className="text-sm font-bold">{t('status.errorTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setErrorOpen(false)}
                className="w-7 h-7 rounded-lg hover-overlay text-text-muted flex items-center justify-center"
                aria-label={t('status.close')}
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words" dir="ltr">
              {detailError}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorOpen(false)
                  setActionError(null)
                  tryOpenExtensionPicker()
                }}
                className="w-full btn-primary text-sm py-2"
              >
                {t('status.openExtensionPicker')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorOpen(false)
                  setActionError(null)
                }}
                className="w-full text-sm py-2 rounded-xl border border-border hover:bg-bg transition-colors"
              >
                {t('status.gotIt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
