import { app, clipboard, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getSettings } from './store'

const LOG_DIR = () => path.join(app.getPath('userData'), 'logs')
const RINGTONE_DIR = () => path.join(app.getPath('userData'), 'ringtones')
const DEFAULTS_DIR = () => path.join(RINGTONE_DIR(), 'defaults')

export type RingtonePreset = 'classic' | 'soft' | 'urgent' | 'chime' | 'custom'

export interface RingtoneOption {
  id: RingtonePreset | string
  name: string
  path: string // empty for classic oscillator; file path otherwise
  builtin: boolean
}

/** Write text to system clipboard (works when navigator.clipboard is blocked). */
export function writeClipboard(text: string): boolean {
  try {
    clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ensureLogDir(): string {
  if (!app.isReady()) return ''
  const dir = LOG_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getTodayLogPath(): string {
  const dir = ensureLogDir()
  if (!dir) return ''
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return path.join(dir, `sip-${stamp}.log`)
}

export function appendSipLogLine(line: string): void {
  try {
    if (!app.isReady()) return
    const settings = getSettings()
    if (!settings.enableLogging) return
    const file = getTodayLogPath()
    if (!file) return
    fs.appendFileSync(file, line + '\n', 'utf8')
  } catch {}
}

export async function saveLogToFile(
  text: string,
  parentWindow: Electron.BrowserWindow | null
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    ensureLogDir()
    const defaultPath = path.join(
      ensureLogDir(),
      `voxphone-sip-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    )
    const result = await dialog.showSaveDialog(parentWindow || undefined!, {
      title: 'Save SIP Debug Log',
      defaultPath,
      filters: [
        { name: 'Log files', extensions: ['log', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' }
    }
    fs.writeFileSync(result.filePath, text, 'utf8')
    return { success: true, path: result.filePath }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function openLogsFolder(): string {
  const dir = ensureLogDir()
  return dir
}

// ---- Ringtones ----

function writeWav(filePath: string, samples: Int16Array, sampleRate = 8000) {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

function toneSamples(
  freqs: number[],
  durationMs: number,
  sampleRate = 8000,
  volume = 0.35
): Int16Array {
  const n = Math.floor((sampleRate * durationMs) / 1000)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    let s = 0
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t)
    s = (s / freqs.length) * volume
    // fade in/out
    const fade = Math.min(1, i / (sampleRate * 0.02), (n - i) / (sampleRate * 0.05))
    out[i] = Math.max(-32767, Math.min(32767, Math.floor(s * fade * 32767)))
  }
  return out
}

function silence(ms: number, sampleRate = 8000): Int16Array {
  return new Int16Array(Math.floor((sampleRate * ms) / 1000))
}

function concatSamples(...parts: Int16Array[]): Int16Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Int16Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function ensureDefaultRingtones(): void {
  const dir = DEFAULTS_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const soft = path.join(dir, 'soft.wav')
  const urgent = path.join(dir, 'urgent.wav')
  const chime = path.join(dir, 'chime.wav')

  if (!fs.existsSync(soft)) {
    writeWav(
      soft,
      concatSamples(
        toneSamples([523.25, 659.25], 400, 8000, 0.25),
        silence(200),
        toneSamples([523.25, 659.25], 400, 8000, 0.25),
        silence(800)
      )
    )
  }
  if (!fs.existsSync(urgent)) {
    writeWav(
      urgent,
      concatSamples(
        toneSamples([880, 988], 180, 8000, 0.4),
        silence(80),
        toneSamples([880, 988], 180, 8000, 0.4),
        silence(80),
        toneSamples([880, 988], 180, 8000, 0.4),
        silence(600)
      )
    )
  }
  if (!fs.existsSync(chime)) {
    writeWav(
      chime,
      concatSamples(
        toneSamples([659.25], 250, 8000, 0.3),
        toneSamples([783.99], 250, 8000, 0.28),
        toneSamples([1046.5], 500, 8000, 0.26),
        silence(900)
      )
    )
  }
}

export function listRingtones(): RingtoneOption[] {
  ensureDefaultRingtones()
  const options: RingtoneOption[] = [
    { id: 'classic', name: 'Classic Beep', path: '', builtin: true },
    { id: 'soft', name: 'Soft Dual-Tone', path: path.join(DEFAULTS_DIR(), 'soft.wav'), builtin: true },
    { id: 'urgent', name: 'Urgent Pulse', path: path.join(DEFAULTS_DIR(), 'urgent.wav'), builtin: true },
    { id: 'chime', name: 'Chime', path: path.join(DEFAULTS_DIR(), 'chime.wav'), builtin: true },
  ]

  const customDir = RINGTONE_DIR()
  if (fs.existsSync(customDir)) {
    for (const name of fs.readdirSync(customDir)) {
      if (name === 'defaults') continue
      const full = path.join(customDir, name)
      if (!fs.statSync(full).isFile()) continue
      if (!/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(name)) continue
      options.push({ id: `custom:${name}`, name, path: full, builtin: false })
    }
  }
  return options
}

export async function pickAndImportRingtone(
  parentWindow: Electron.BrowserWindow | null
): Promise<{ success: boolean; path?: string; name?: string; error?: string }> {
  try {
    const result = await dialog.showOpenDialog(parentWindow || undefined!, {
      title: 'Choose ringtone',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Cancelled' }
    }
    const src = result.filePaths[0]
    const dir = RINGTONE_DIR()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const base = path.basename(src)
    const dest = path.join(dir, base)
    fs.copyFileSync(src, dest)
    return { success: true, path: dest, name: base }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function ringtoneToDataUrl(filePath: string): { success: boolean; dataUrl?: string; error?: string } {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mime =
      ext === 'mp3' ? 'audio/mpeg' :
      ext === 'wav' ? 'audio/wav' :
      ext === 'ogg' ? 'audio/ogg' :
      ext === 'm4a' || ext === 'aac' ? 'audio/mp4' :
      ext === 'flac' ? 'audio/flac' :
      ext === 'webm' ? 'audio/webm' :
      'application/octet-stream'
    const data = fs.readFileSync(filePath)
    return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function resolveRingtonePath(preset: string, customPath: string): string {
  if (preset === 'classic' || !preset) return ''
  if (preset === 'custom') return customPath || ''
  const builtins = listRingtones()
  const found = builtins.find((r) => r.id === preset)
  return found?.path || customPath || ''
}
