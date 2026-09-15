import { useEffect, useState, type ReactNode } from 'react'
import { Mic, Volume2 } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import {
  deviceLabel,
  ensureAudioPermission,
  listAudioDevices,
  normalizeDeviceId,
  playOutputTest,
  startMicMeter,
} from '../../lib/audioDevices'

type DeviceFocus = 'input' | 'output'

interface AudioDevicePanelProps {
  variant?: 'popover' | 'inline'
  inputDevice: string
  outputDevice: string
  speakerVolume?: number
  focus?: DeviceFocus
  onSelectInput: (deviceId: string) => void
  onSelectOutput: (deviceId: string) => void
}

export function AudioDevicePanel({
  variant = 'inline',
  inputDevice,
  outputDevice,
  speakerVolume = 1,
  focus,
  onSelectInput,
  onSelectOutput,
}: AudioDevicePanelProps) {
  const { t } = useI18n()
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [permissionError, setPermissionError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [micLevel, setMicLevel] = useState(0)

  const selectedInput = normalizeDeviceId(inputDevice)
  const selectedOutput = normalizeDeviceId(outputDevice)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const granted = await ensureAudioPermission()
      if (cancelled) return
      setPermissionError(!granted)
      try {
        const list = await listAudioDevices()
        if (cancelled) return
        setInputs(list.inputs)
        setOutputs(list.outputs)
        setLoaded(true)
      } catch {
        if (!cancelled) {
          setInputs([])
          setOutputs([])
          setLoaded(true)
        }
      }
    }

    void load()
    const onChange = () => {
      void load()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
    }
  }, [])

  useEffect(() => {
    const stop = startMicMeter(selectedInput, (level) => setMicLevel(level))
    return () => {
      stop()
      setMicLevel(0)
    }
  }, [selectedInput])

  const handleTest = async () => {
    if (testing) return
    setTestError('')
    setTesting(true)
    try {
      await playOutputTest(selectedOutput, speakerVolume)
    } catch {
      setTestError(t('settings.audio.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  const popover = variant === 'popover'

  return (
    <div className={popover ? 'space-y-3' : 'space-y-4'}>
      {permissionError && (
        <p className="text-[11px] text-warning leading-relaxed">
          {t('settings.audio.permissionNeeded')}
        </p>
      )}

      <DeviceGroup
        title={t('settings.audio.output')}
        icon={<Volume2 size={14} />}
        highlighted={focus === 'output'}
      >
        <DeviceOption
          selected={selectedOutput === ''}
          label={t('settings.audio.systemDefault')}
          onSelect={() => onSelectOutput('')}
        />
        {outputs.map((device) => (
          <DeviceOption
            key={device.deviceId}
            selected={selectedOutput === device.deviceId}
            label={deviceLabel(device, t('settings.audio.speaker'))}
            onSelect={() => onSelectOutput(device.deviceId)}
          />
        ))}
        {loaded && outputs.length === 0 && (
          <p className="text-[11px] text-text-muted px-1 py-0.5">{t('settings.audio.noDevices')}</p>
        )}
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
          className="mt-1.5 w-full btn-primary text-xs py-1.5 disabled:opacity-60"
        >
          {testing ? t('settings.audio.testing') : t('settings.audio.testSound')}
        </button>
        {testError && (
          <p className="text-[11px] text-error">{testError}</p>
        )}
      </DeviceGroup>

      <DeviceGroup
        title={t('settings.audio.input')}
        icon={<Mic size={14} />}
        highlighted={focus === 'input'}
      >
        <DeviceOption
          selected={selectedInput === ''}
          label={t('settings.audio.systemDefault')}
          onSelect={() => onSelectInput('')}
        />
        {inputs.map((device) => (
          <DeviceOption
            key={device.deviceId}
            selected={selectedInput === device.deviceId}
            label={deviceLabel(device, t('settings.audio.mic'))}
            onSelect={() => onSelectInput(device.deviceId)}
          />
        ))}
        {loaded && inputs.length === 0 && (
          <p className="text-[11px] text-text-muted px-1 py-0.5">{t('settings.audio.noDevices')}</p>
        )}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-text-muted">{t('settings.audio.micLevel')}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              style={{ width: `${Math.round(micLevel * 100)}%` }}
            />
          </div>
        </div>
      </DeviceGroup>
    </div>
  )
}

function DeviceGroup({
  title,
  icon,
  highlighted,
  children,
}: {
  title: string
  icon: ReactNode
  highlighted?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-xl border p-2.5 space-y-1 ${
        highlighted ? 'border-accent/50 bg-accent/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
        <span className="text-accent">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

function DeviceOption({
  selected,
  label,
  onSelect,
}: {
  selected: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-start text-xs transition-colors ${
        selected
          ? 'bg-accent/15 text-accent'
          : 'text-text hover:bg-bg'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full border flex-shrink-0 ${
          selected ? 'bg-accent border-accent' : 'border-text-muted'
        }`}
      />
      <span className="truncate" dir="ltr" title={label}>{label}</span>
    </button>
  )
}
