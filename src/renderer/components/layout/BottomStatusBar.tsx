import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, Volume2, VolumeX, AlertCircle, X } from 'lucide-react'
import { useSipStore } from '../../stores/sipStore'
import { useCallStore } from '../../stores/callStore'
import { useI18n } from '../../lib/i18n'
import { Slider } from '../ui/slider'

export function BottomStatusBar() {
  const { t, isRtl } = useI18n()
  const sipStatus = useSipStore((s) => s.status)
  const errorMessage = useSipStore((s) => s.errorMessage)
  const actionError = useSipStore((s) => s.actionError)
  const setActionError = useSipStore((s) => s.setActionError)
  const calls = useCallStore((s) => s.calls)
  const activeCalls = Array.from(calls.values()).filter(
    (c) => c.state === 'active' || c.state === 'holding' || c.state === 'outgoing' || c.state === 'ringing'
  )

  const [volume, setVolume] = useState(70)
  const [micVolume, setMicVolume] = useState(80)
  const [deviceName, setDeviceName] = useState(() => t('status.defaultDevice'))
  const [deviceKind, setDeviceKind] = useState<'output' | 'input'>('output')
  const [errorOpen, setErrorOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const settings = (await window.api.settings.get()) as {
          ringtoneVolume?: number
          micVolume?: number
          outputDevice?: string
          inputDevice?: string
        }
        if (cancelled) return
        if (typeof settings.ringtoneVolume === 'number') {
          setVolume(Math.round(settings.ringtoneVolume * 100))
        }
        if (typeof settings.micVolume === 'number') {
          setMicVolume(Math.round(settings.micVolume * 100))
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (cancelled) return
          const outputs = devices.filter((d) => d.kind === 'audiooutput')
          const inputs = devices.filter((d) => d.kind === 'audioinput')
          const selected =
            outputs.find((d) => d.deviceId === settings.outputDevice) ||
            outputs.find((d) => d.deviceId === 'default') ||
            outputs[0]
          if (selected?.label) {
            setDeviceName(selected.label)
            setDeviceKind('output')
          } else if (inputs[0]?.label) {
            setDeviceName(inputs[0].label)
            setDeviceKind('input')
          } else {
            setDeviceName(t('status.defaultDevice'))
          }
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
      window.api.settings.set('ringtoneVolume', v / 100)
    }, 250)
  }

  const handleMic = (vals: number[]) => {
    const v = vals[0]
    setMicVolume(v)
    window.api.settings.set('micVolume', v / 100)
  }

  const DeviceIcon = deviceKind === 'output' ? Headphones : Mic
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
        <button
          type="button"
          onClick={openError}
          disabled={!canOpenError}
          className={`flex items-center gap-1 flex-shrink-0 rounded-md px-1 py-0.5 transition-colors ${
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

        <div className="flex items-center gap-1 min-w-0 flex-1 text-text-muted">
          <DeviceIcon size={11} className="flex-shrink-0 text-accent" />
          <span className="truncate" dir="ltr" title={deviceName}>{deviceName}</span>
          {activeCalls.length > 0 && (
            <span className="text-accent font-medium flex-shrink-0">{t('status.activeCalls', { count: activeCalls.length })}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 w-[140px]">
          <div className="flex items-center gap-0.5 flex-1" title={t('status.volume')}>
            <VolumeIcon size={11} className="text-text-muted flex-shrink-0" />
            <Slider value={[volume]} onValueChange={handleVolume} min={0} max={100} step={1} />
          </div>
          <div className="flex items-center gap-0.5 flex-1" title={t('status.mic')}>
            <Mic size={11} className="text-text-muted flex-shrink-0" />
            <Slider value={[micVolume]} onValueChange={handleMic} min={0} max={100} step={1} />
          </div>
        </div>
      </div>

      {errorOpen && detailError && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
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
            <button
              type="button"
              onClick={() => {
                setErrorOpen(false)
                setActionError(null)
              }}
              className="mt-4 w-full btn-primary text-sm py-2"
            >
              {t('status.gotIt')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
