import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, Volume2, VolumeX } from 'lucide-react'
import { useSipStore } from '../../stores/sipStore'
import { useCallStore } from '../../stores/callStore'
import { Slider } from '../ui/slider'

/**
 * Persistent compact footer bar:
 *  – SIP registration state (green dot + «آماده»)
 *  – Active audio device indicator (truncated name)
 *  – Master ringtone/call volume slider
 */
export function BottomStatusBar() {
  const sipStatus = useSipStore((s) => s.status)
  const errorMessage = useSipStore((s) => s.errorMessage)
  const calls = useCallStore((s) => s.calls)
  const activeCalls = Array.from(calls.values()).filter(
    (c) => c.state === 'active' || c.state === 'holding' || c.state === 'outgoing' || c.state === 'ringing'
  )

  const [volume, setVolume] = useState(70)
  const [deviceName, setDeviceName] = useState('پیش‌فرض سیستم')
  const [deviceKind, setDeviceKind] = useState<'output' | 'input'>('output')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load persisted volume + resolve active audio device name
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const settings = (await window.api.settings.get()) as {
          ringtoneVolume?: number
          outputDevice?: string
          inputDevice?: string
        }
        if (cancelled) return
        if (typeof settings.ringtoneVolume === 'number') {
          setVolume(Math.round(settings.ringtoneVolume * 100))
        }

        // Resolve device label (labels require prior media permission)
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
          }
        } catch {
          /* keep default label */
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
  }, [])

  const handleVolume = (vals: number[]) => {
    const v = vals[0]
    setVolume(v)
    // Debounced persist to settings store
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.settings.set('ringtoneVolume', v / 100)
    }, 250)
  }

  const statusLabel =
    sipStatus === 'registered' ? 'آماده' :
    sipStatus === 'connecting' ? 'در حال اتصال…' :
    sipStatus === 'failed' ? 'خطا' :
    'آفلاین'

  const dotColor =
    sipStatus === 'registered' ? 'bg-success' :
    sipStatus === 'connecting' ? 'bg-warning' :
    sipStatus === 'failed' ? 'bg-error' :
    'bg-text-muted'

  const DeviceIcon = deviceKind === 'output' ? Headphones : Mic
  const VolumeIcon = volume === 0 ? VolumeX : Volume2

  return (
    <div className="h-9 px-3 flex items-center justify-between gap-3 text-[11px] bg-bg-surface border-t border-border flex-shrink-0">
      {/* SIP registration state */}
      <div
        className="flex items-center gap-1.5 flex-shrink-0"
        title={errorMessage && sipStatus !== 'registered' ? errorMessage : `SIP: ${sipStatus}`}
      >
        <span className="relative flex w-2 h-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {sipStatus === 'registered' && (
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-50" />
          )}
        </span>
        <span className="font-medium text-text-secondary">{statusLabel}</span>
        {activeCalls.length > 0 && (
          <span className="text-accent">({activeCalls.length} تماس فعال)</span>
        )}
      </div>

      {/* Active audio device */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center text-text-muted" title={deviceName}>
        <DeviceIcon size={12} className="flex-shrink-0" />
        <span className="truncate max-w-[130px]" dir="ltr">{deviceName}</span>
      </div>

      {/* Master volume */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-[110px]" title="بلندی صدای زنگ و تماس">
        <VolumeIcon size={13} className="text-text-muted flex-shrink-0" />
        <Slider value={[volume]} onValueChange={handleVolume} min={0} max={100} step={1} />
      </div>
    </div>
  )
}
