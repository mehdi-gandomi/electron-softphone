export type AudioDeviceList = {
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
}

type SinkTarget = {
  setSinkId?: (sinkId: string) => Promise<void>
}

let outputTestStop: (() => void) | null = null

export function normalizeDeviceId(id: string | undefined | null): string {
  if (!id || id === 'default' || id === 'communications') return ''
  return id
}

export function deviceLabel(device: MediaDeviceInfo, fallback: string): string {
  const label = device.label?.trim()
  if (label) return label
  if (!device.deviceId) return fallback
  return `${fallback} (${device.deviceId.slice(0, 8)})`
}

function isHardwareDevice(device: MediaDeviceInfo): boolean {
  return Boolean(device.deviceId) && device.deviceId !== 'default' && device.deviceId !== 'communications'
}

export async function ensureAudioPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch {
    return false
  }
}

export async function listAudioDevices(): Promise<AudioDeviceList> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return {
    inputs: devices.filter((d) => d.kind === 'audioinput' && isHardwareDevice(d)),
    outputs: devices.filter((d) => d.kind === 'audiooutput' && isHardwareDevice(d)),
  }
}

export async function applyOutputSink(target: unknown, deviceId: string): Promise<void> {
  const sink = target as SinkTarget & { state?: string; resume?: () => Promise<void> }
  if (sink.state === 'suspended' && typeof sink.resume === 'function') {
    try {
      await sink.resume()
    } catch {
      /* ignore */
    }
  }
  if (typeof sink.setSinkId !== 'function') return
  try {
    await sink.setSinkId(normalizeDeviceId(deviceId))
  } catch {
    /* keep the current sink */
  }
}

export function audioInputConstraints(deviceId: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  }
  const id = normalizeDeviceId(deviceId)
  if (id) constraints.deviceId = { exact: id }
  return constraints
}

export async function openMicrophone(deviceId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioInputConstraints(deviceId),
      video: false,
    })
  } catch (err) {
    if (!normalizeDeviceId(deviceId)) throw err
    return navigator.mediaDevices.getUserMedia({
      audio: audioInputConstraints(''),
      video: false,
    })
  }
}

export async function playOutputTest(deviceId: string, volume = 0.5): Promise<void> {
  outputTestStop?.()

  const ctx = new AudioContext()
  let closed = false
  outputTestStop = () => {
    if (closed) return
    closed = true
    ctx.close().catch(() => {})
  }

  try {
    await applyOutputSink(ctx, deviceId)
    if (ctx.state === 'suspended') await ctx.resume()

    const gainLevel = Math.max(0.05, Math.min(1, volume)) * 0.35
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(gainLevel, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.start(start)
      osc.stop(start + duration)
    }

    const t = ctx.currentTime
    playTone(880, t, 0.35)
    playTone(1174.66, t + 0.4, 0.4)

    await new Promise((resolve) => setTimeout(resolve, 950))
  } finally {
    outputTestStop?.()
    if (outputTestStop) outputTestStop = null
  }
}

export function startMicMeter(
  deviceId: string,
  onLevel: (level: number) => void
): () => void {
  let cancelled = false
  let ctx: AudioContext | null = null
  let stream: MediaStream | null = null
  let raf = 0

  const start = async () => {
    try {
      stream = await openMicrophone(deviceId)
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)

      const tick = () => {
        if (cancelled) return
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        onLevel(Math.min(1, rms * 4))
        raf = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      if (!cancelled) onLevel(0)
    }
  }

  void start()

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((track) => track.stop())
    ctx?.close().catch(() => {})
  }
}
