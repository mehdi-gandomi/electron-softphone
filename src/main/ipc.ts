import { ipcMain, BrowserWindow, shell } from 'electron'
import { SipEngine } from './sip/engine'
import { sipLogBuffer } from './sip/transport'
import { getSettings, setSetting, getActiveAccount, addAccount, updateAccount, removeAccount, setActiveAccount } from './store'
import type { SipAccount, CallInfo, ScreenPopParam, ScreenPopParamSource } from '../shared/types'
import https from 'https'
import http from 'http'
import {
  writeClipboard,
  saveLogToFile,
  openLogsFolder,
  listRingtones,
  pickAndImportRingtone,
  ringtoneToDataUrl,
  ensureDefaultRingtones,
  resolveRingtonePath,
  getTodayLogPath,
} from './ringtone'

let sipEngine: SipEngine | null = null
let mainWindow: BrowserWindow | null = null

export function initIpc(win: BrowserWindow) {
  mainWindow = win

  // Settings
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    setSetting(key as never, value as never)
    return true
  })

  // Accounts
  ipcMain.handle('accounts:list', () => getSettings().accounts)

  ipcMain.handle('accounts:add', (_e, account: SipAccount) => {
    addAccount(account)
    // Auto-activate first / newly added account if none active
    const settings = getSettings()
    if (!settings.activeAccountId) {
      setActiveAccount(account.id)
    }
    return true
  })

  ipcMain.handle('accounts:update', (_e, id: string, updates: Partial<SipAccount>) => {
    updateAccount(id, updates)
    return true
  })

  ipcMain.handle('accounts:remove', async (_e, id: string) => {
    const settings = getSettings()
    const wasActive = settings.activeAccountId === id || getActiveAccount()?.id === id
    if (wasActive && sipEngine) {
      try {
        await sipEngine.unregister()
      } catch {}
      try {
        await sipEngine.stop()
      } catch {}
      sipEngine = null
    }
    removeAccount(id)
    if (wasActive) {
      setActiveAccount('')
      setSetting('activeAccountId', '')
    }
    return true
  })

  ipcMain.handle('accounts:setActive', (_e, id: string) => {
    setActiveAccount(id)
    return true
  })

  // SIP Engine
  ipcMain.handle('sip:start', async () => {
    try {
      const account = getActiveAccount()
      if (!account) {
        return { success: false, error: 'No account configured' }
      }

      if (!sipEngine) {
        sipEngine = new SipEngine()
        setupSipCallbacks(sipEngine, win)
      }

      await sipEngine.configure(account)
      await sipEngine.start()
      await sipEngine.register()
      return { success: true }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  })

  ipcMain.handle('sip:stop', async () => {
    if (sipEngine) {
      await sipEngine.stop()
      sipEngine = null
    }
    return { success: true }
  })

  ipcMain.handle('sip:configure', async (_e, account: SipAccount) => {
    try {
      if (!sipEngine) {
        sipEngine = new SipEngine()
        setupSipCallbacks(sipEngine, win)
      }
      await sipEngine.configure(account)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sip:register', async () => {
    try {
      if (!sipEngine) {
        const account = getActiveAccount()
        if (!account) return { success: false, error: 'No account configured' }
        sipEngine = new SipEngine()
        setupSipCallbacks(sipEngine, win)
        await sipEngine.configure(account)
        await sipEngine.start()
      }
      await sipEngine.register()
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sip:unregister', async () => {
    try {
      if (sipEngine) {
        await sipEngine.unregister()
      }
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Calls
  ipcMain.handle('sip:make-call', async (_e, number: string) => {
    if (!sipEngine) return { success: false, error: 'Engine not running' }
    try {
      const callId = await sipEngine.makeCall(number)
      return { success: true, callId }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sip:answer-call', async (_e, callId: string) => {
    if (!sipEngine) return { success: false, error: 'Engine not running' }
    try {
      await sipEngine.answerCall(callId)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sip:hangup-call', async (_e, callId: string) => {
    if (!sipEngine) return { success: false }
    await sipEngine.hangupCall(callId)
    return { success: true }
  })

  ipcMain.handle('sip:hold-call', async (_e, callId: string) => {
    if (!sipEngine) return { success: false }
    await sipEngine.holdCall(callId)
    return { success: true }
  })

  ipcMain.handle('sip:unhold-call', async (_e, callId: string) => {
    if (!sipEngine) return { success: false }
    await sipEngine.unholdCall(callId)
    return { success: true }
  })

  ipcMain.handle('sip:transfer-call', async (_e, callId: string, target: string) => {
    if (!sipEngine) return { success: false }
    await sipEngine.transferCall(callId, target)
    return { success: true }
  })

  ipcMain.handle('sip:send-dtmf', async (_e, callId: string, digit: string) => {
    if (!sipEngine) return { success: false }
    await sipEngine.sendDtmf(callId, digit)
    return { success: true }
  })

  ipcMain.handle('sip:mute-call', async (_e, callId: string, muted: boolean) => {
    if (!sipEngine) return { success: false }
    await sipEngine.muteCall(callId, muted)
    return { success: true }
  })

  ipcMain.handle('sip:get-active-calls', () => {
    if (!sipEngine) return []
    return sipEngine.getActiveCalls()
  })

  ipcMain.handle('sip:get-call', (_e, callId: string) => {
    if (!sipEngine) return null
    return sipEngine.getCall(callId)
  })

  // Webhook / API integration
  ipcMain.handle('api:send-webhook', async (_e, event: string, data: Record<string, unknown>) => {
    const settings = getSettings()
    if (!settings.apiIntegration.enabled || !settings.apiIntegration.webhookUrl) {
      return { success: false, error: 'API integration not configured' }
    }

    try {
      await sendWebhook(settings.apiIntegration.webhookUrl, {
        event,
        timestamp: new Date().toISOString(),
        ...data,
      }, settings.apiIntegration.apiKey)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Open external URL
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
    return true
  })

  // Debug logs
  ipcMain.handle('sip:get-log', () => {
    return sipLogBuffer
  })

  ipcMain.handle('sip:clear-log', () => {
    sipLogBuffer.length = 0
    return true
  })

  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    return writeClipboard(String(text || ''))
  })

  ipcMain.handle('debug:save-log', async (_e, text: string) => {
    return saveLogToFile(String(text || ''), mainWindow)
  })

  ipcMain.handle('debug:open-logs-folder', async () => {
    const dir = openLogsFolder()
    if (dir) await shell.openPath(dir)
    return { success: !!dir, path: dir }
  })

  ipcMain.handle('debug:get-log-file-path', () => {
    return getTodayLogPath()
  })

  // Ringtones
  ipcMain.handle('ringtone:list', () => {
    ensureDefaultRingtones()
    return listRingtones()
  })

  ipcMain.handle('ringtone:import', async () => {
    return pickAndImportRingtone(mainWindow)
  })

  ipcMain.handle('ringtone:read-data-url', (_e, filePath: string) => {
    return ringtoneToDataUrl(filePath)
  })

  ipcMain.handle('ringtone:resolve', (_e, preset: string, customPath: string) => {
    return resolveRingtonePath(preset || 'classic', customPath || '')
  })

  ipcMain.handle('sip:reconnect', async () => {
    try {
      if (sipEngine) {
        await sipEngine.stop()
        sipEngine = null
      }
      const account = getActiveAccount()
      if (!account) {
        return { success: false, error: 'No account configured' }
      }
      sipEngine = new SipEngine()
      setupSipCallbacks(sipEngine, win)
      await sipEngine.configure(account)
      await sipEngine.start()
      await sipEngine.register()
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function setupSipCallbacks(engine: SipEngine, win: BrowserWindow) {
  engine.on('registration-status', (status) => {
    win.webContents.send('sip:registration-status', status)
  })

  engine.on('outgoing-call', (callInfo: CallInfo) => {
    win.webContents.send('sip:outgoing-call', callInfo)
  })

  engine.on('incoming-call', (callInfo: CallInfo) => {
    win.webContents.send('sip:incoming-call', callInfo)
    sendWebhookForEvent('incoming_call', callInfo)
  })

  engine.on('call-state', (data) => {
    win.webContents.send('sip:call-state', data)
    if (data.state === 'active') {
      const call = engine?.getCall(data.callId)
      if (call) {
        sendWebhookForEvent('call_answered', call)
        openScreenPop(call)
      }
    }
    if (data.state === 'ended') {
      const call = engine?.getCall(data.callId)
      if (call) sendWebhookForEvent('call_ended', call)
    }
  })

  engine.on('call-ended', (data) => {
    win.webContents.send('sip:call-ended', data)
  })

  engine.on('transfer-status', (data) => {
    win.webContents.send('sip:transfer-status', data)
  })

  engine.on('dtmf-sent', (data) => {
    win.webContents.send('sip:dtmf-sent', data)
  })

  engine.on('error', (err) => {
    console.error('SIP Error:', err)
  })

  engine.on('audio-out', (data: { callId: string; pcm: Buffer }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sip:audio-out', {
        callId: data.callId,
        pcm: data.pcm,
      })
    }
  })
}

// Mic PCM from renderer
ipcMain.on('sip:audio-in', (_e, callId: string, pcm: Uint8Array) => {
  if (sipEngine && callId && pcm) {
    sipEngine.sendPcmAudio(callId, Buffer.from(pcm))
  }
})


async function sendWebhookForEvent(event: string, call: CallInfo) {
  const settings = getSettings()
  const api = settings.apiIntegration
  if (!api.enabled || !api.webhookUrl) return

  const eventMap: Record<string, boolean> = {
    incoming_call: api.events.incomingCall,
    call_answered: api.events.callAnswered,
    call_ended: api.events.callEnded,
    call_missed: api.events.callMissed,
  }

  if (!eventMap[event]) return

  const payload: Record<string, unknown> = {
    event,
    call_id: call.id,
    caller_id: call.remoteNumber,
    caller_name: call.remoteName,
    extension: call.localNumber,
    direction: call.direction,
    duration: call.duration,
    timestamp: new Date().toISOString(),
  }

  // Auto-fill fields
  for (const field of api.autoFillFields) {
    if (field.source === 'custom') {
      payload[field.key] = field.customValue
    }
  }

  try {
    await sendWebhook(api.webhookUrl, payload, api.apiKey)
  } catch (err) {
    console.error('Webhook failed:', err)
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatAnswerParts(answerTime: number): { date: string; time: string; datetime: string } {
  const d = new Date(answerTime > 0 ? answerTime : Date.now())
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return { date, time, datetime: d.toISOString() }
}

function resolveScreenPopValue(source: ScreenPopParamSource, call: CallInfo, customValue?: string): string {
  const answered = formatAnswerParts(call.answerTime)
  switch (source) {
    case 'caller_id':
      return call.remoteNumber || ''
    case 'caller_name':
      return call.remoteName || ''
    case 'extension':
      return call.localNumber || ''
    case 'issabel_id':
      return call.issabelId || ''
    case 'call_id':
      return call.callId || call.id || ''
    case 'direction':
      return call.direction || ''
    case 'answer_date':
      return answered.date
    case 'answer_time':
      return answered.time
    case 'answer_datetime':
      return answered.datetime
    case 'custom':
      return customValue || ''
    default:
      return ''
  }
}

function openScreenPop(call: CallInfo): void {
  const screenPop = getSettings().screenPop
  if (!screenPop?.enabled || !screenPop.baseUrl?.trim()) return

  try {
    const url = new URL(screenPop.baseUrl.trim())
    const params: ScreenPopParam[] = screenPop.params || []
    for (const param of params) {
      const name = (param.name || '').trim()
      if (!name) continue
      url.searchParams.set(name, resolveScreenPopValue(param.source, call, param.customValue))
    }
    void shell.openExternal(url.toString())
  } catch (err) {
    console.error('Screen pop failed:', err)
  }
}

function sendWebhook(url: string, data: Record<string, unknown>, apiKey?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const body = JSON.stringify(data)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const transport = urlObj.protocol === 'https:' ? https : http
    const req = transport.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers,
      },
      (res) => {
        res.resume()
        resolve()
      }
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/** Graceful SIP teardown (used on Quit). */
export async function stopSipEngine(): Promise<void> {
  if (!sipEngine) return
  try {
    await sipEngine.stop()
  } catch {}
  sipEngine = null
}

