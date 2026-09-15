import { app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getSettings } from './store'

const SAMPLE_RATE = 8000
const BYTES_PER_SAMPLE = 2
/** Max skew before we pad the lagging side with silence (~200ms) */
const MAX_SKEW_SAMPLES = SAMPLE_RATE / 5

export function getDefaultRecordingDir(): string {
  return path.join(app.getPath('userData'), 'recordings')
}

export function resolveRecordingDir(): string {
  const custom = getSettings().recordingPath?.trim()
  if (custom) return custom
  return getDefaultRecordingDir()
}

export function ensureRecordingDir(dir?: string): string {
  const target = dir || resolveRecordingDir()
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
  return target
}

export async function pickRecordingFolder(
  parentWindow: Electron.BrowserWindow | null
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const result = await dialog.showOpenDialog(parentWindow || undefined!, {
      title: 'Choose recordings folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: resolveRecordingDir(),
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Cancelled' }
    }
    const dir = result.filePaths[0]
    ensureRecordingDir(dir)
    return { success: true, path: dir }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openRecordingFolder(): Promise<{ success: boolean; path?: string }> {
  try {
    const dir = ensureRecordingDir()
    await shell.openPath(dir)
    return { success: true, path: dir }
  } catch {
    return { success: false }
  }
}

export async function revealRecordingFile(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    shell.showItemInFolder(filePath)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function recordingToDataUrl(filePath: string): {
  success: boolean
  dataUrl?: string
  error?: string
} {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    const data = fs.readFileSync(filePath)
    return { success: true, dataUrl: `data:audio/wav;base64,${data.toString('base64')}` }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function sanitizePart(value: string): string {
  const cleaned = value.replace(/[^\w.+-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 64) || 'unknown'
}

function formatStamp(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}${m}${day}-${h}${min}${s}`
}

function writeWavHeader(fd: number, dataBytes: number, channels: 1 | 2): void {
  const blockAlign = channels * BYTES_PER_SAMPLE
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * blockAlign, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  fs.writeSync(fd, buf, 0, 44, 0)
}

function pcmToSamples(pcm: Buffer): Int16Array {
  const n = Math.floor(pcm.length / 2)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = pcm.readInt16LE(i * 2)
  }
  return out
}

function mixSample(a: number, b: number): number {
  // Sum both legs (do not average — averaging halves level when only one side talks).
  const mixed = a + b
  if (mixed > 32767) return 32767
  if (mixed < -32768) return -32768
  return mixed
}

/**
 * Streams a WAV for one call (local + remote Int16LE @ 8kHz).
 * Mono: mixed both sides. Stereo: L = local (you), R = remote (caller).
 */
export class CallRecorder {
  readonly filePath: string
  private readonly stereo: boolean
  private readonly channels: 1 | 2
  private fd: number | null = null
  private dataBytes = 0
  private localQ: number[] = []
  private remoteQ: number[] = []
  private finalized = false

  constructor(
    callId: string,
    direction: 'inbound' | 'outbound',
    remoteNumber: string,
    stereo = false
  ) {
    this.stereo = stereo
    this.channels = stereo ? 2 : 1
    const dir = ensureRecordingDir()
    const mode = stereo ? 'stereo' : 'mono'
    const name = `${formatStamp()}_${direction}_${sanitizePart(remoteNumber || callId)}_${mode}.wav`
    this.filePath = path.join(dir, name)
    this.fd = fs.openSync(this.filePath, 'w')
    writeWavHeader(this.fd, 0, this.channels)
  }

  writeLocal(pcm: Buffer): void {
    if (this.finalized || !this.fd) return
    const samples = pcmToSamples(pcm)
    for (let i = 0; i < samples.length; i++) this.localQ.push(samples[i])
    this.drain()
  }

  writeRemote(pcm: Buffer): void {
    if (this.finalized || !this.fd) return
    const samples = pcmToSamples(pcm)
    for (let i = 0; i < samples.length; i++) this.remoteQ.push(samples[i])
    this.drain()
  }

  /** Feed silence for the local leg (mute / hold) matching remote chunk length. */
  writeLocalSilence(byteLength: number): void {
    if (this.finalized || !this.fd || byteLength <= 0) return
    const n = Math.floor(byteLength / 2)
    for (let i = 0; i < n; i++) this.localQ.push(0)
    this.drain()
  }

  private drain(forcePad = false): void {
    if (!this.fd) return

    while (this.localQ.length > 0 && this.remoteQ.length > 0) {
      this.writeFrame(this.localQ.shift()!, this.remoteQ.shift()!)
    }

    if (!forcePad) {
      if (this.localQ.length > MAX_SKEW_SAMPLES) {
        const excess = this.localQ.length - MAX_SKEW_SAMPLES
        for (let i = 0; i < excess; i++) {
          this.writeFrame(this.localQ.shift()!, 0)
        }
      }
      if (this.remoteQ.length > MAX_SKEW_SAMPLES) {
        const excess = this.remoteQ.length - MAX_SKEW_SAMPLES
        for (let i = 0; i < excess; i++) {
          this.writeFrame(0, this.remoteQ.shift()!)
        }
      }
      return
    }

    while (this.localQ.length > 0) {
      this.writeFrame(this.localQ.shift()!, 0)
    }
    while (this.remoteQ.length > 0) {
      this.writeFrame(0, this.remoteQ.shift()!)
    }
  }

  private writeFrame(local: number, remote: number): void {
    if (!this.fd) return
    if (this.stereo) {
      const buf = Buffer.alloc(4)
      buf.writeInt16LE(local, 0)
      buf.writeInt16LE(remote, 2)
      fs.writeSync(this.fd, buf)
      this.dataBytes += 4
    } else {
      const buf = Buffer.alloc(2)
      buf.writeInt16LE(mixSample(local, remote), 0)
      fs.writeSync(this.fd, buf)
      this.dataBytes += 2
    }
  }

  finalize(): string | null {
    if (this.finalized) return this.filePath
    this.finalized = true
    this.drain(true)
    if (this.fd !== null) {
      writeWavHeader(this.fd, this.dataBytes, this.channels)
      fs.closeSync(this.fd)
      this.fd = null
    }
    if (this.dataBytes === 0) {
      try {
        fs.unlinkSync(this.filePath)
      } catch {}
      return null
    }
    return this.filePath
  }
}
