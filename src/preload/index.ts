import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  // Window controls
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    toggleAlwaysOnTop: () => void
  }

  // Settings
  settings: {
    get: () => Promise<Record<string, unknown>>
    set: (key: string, value: unknown) => Promise<boolean>
    unlockDeveloper: (key: string) => Promise<{ success: boolean }>
    lockDeveloper: () => Promise<boolean>
    isDeveloperUnlocked: () => Promise<boolean>
    resetBuildDefaults: () => Promise<Record<string, unknown>>
  }

  // Accounts
  accounts: {
    list: () => Promise<unknown[]>
    add: (account: unknown) => Promise<boolean>
    update: (id: string, updates: unknown) => Promise<boolean>
    remove: (id: string) => Promise<boolean>
    setActive: (id: string) => Promise<boolean>
  }

  // SIP
  sip: {
    start: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean }>
    configure: (account: unknown) => Promise<{ success: boolean; error?: string }>
    register: () => Promise<{ success: boolean; error?: string }>
    unregister: () => Promise<{ success: boolean; error?: string }>
    makeCall: (number: string) => Promise<{ success: boolean; callId?: string; error?: string }>
    answerCall: (callId: string) => Promise<{ success: boolean }>
    hangupCall: (callId: string) => Promise<{ success: boolean }>
    holdCall: (callId: string) => Promise<{ success: boolean }>
    unholdCall: (callId: string) => Promise<{ success: boolean }>
    transferCall: (callId: string, target: string) => Promise<{ success: boolean }>
    sendDtmf: (callId: string, digit: string) => Promise<{ success: boolean }>
    muteCall: (callId: string, muted: boolean) => Promise<{ success: boolean }>
    getActiveCalls: () => Promise<unknown[]>
    getCall: (callId: string) => Promise<unknown>
    getLog: () => Promise<Array<{ timestamp: number; direction: string; message: string; raw?: string }>>
    clearLog: () => Promise<boolean>
    reconnect: () => Promise<{ success: boolean; error?: string }>
    sendAudio: (callId: string, pcm: ArrayBuffer) => void
    onAudio: (callback: (data: { callId: string; pcm: Uint8Array }) => void) => void
    offAudio: () => void
  }

  // API Integration
  api: {
    sendWebhook: (event: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  }

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void

  clipboard: {
    writeText: (text: string) => Promise<boolean>
  }

  debug: {
    saveLog: (text: string) => Promise<{ success: boolean; path?: string; error?: string }>
    openLogsFolder: () => Promise<{ success: boolean; path?: string }>
    getLogFilePath: () => Promise<string>
  }

  ringtone: {
    list: () => Promise<Array<{ id: string; name: string; path: string; builtin: boolean }>>
    import: () => Promise<{ success: boolean; path?: string; name?: string; error?: string }>
    readDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    resolve: (preset: string, customPath: string) => Promise<string>
  }
}

const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    unlockDeveloper: (key) => ipcRenderer.invoke('settings:unlockDeveloper', key),
    lockDeveloper: () => ipcRenderer.invoke('settings:lockDeveloper'),
    isDeveloperUnlocked: () => ipcRenderer.invoke('settings:isDeveloperUnlocked'),
    resetBuildDefaults: () => ipcRenderer.invoke('settings:resetBuildDefaults'),
  },

  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (account) => ipcRenderer.invoke('accounts:add', account),
    update: (id, updates) => ipcRenderer.invoke('accounts:update', id, updates),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id),
  },

  sip: {
    start: () => ipcRenderer.invoke('sip:start'),
    stop: () => ipcRenderer.invoke('sip:stop'),
    configure: (account) => ipcRenderer.invoke('sip:configure', account),
    register: () => ipcRenderer.invoke('sip:register'),
    unregister: () => ipcRenderer.invoke('sip:unregister'),
    makeCall: (number) => ipcRenderer.invoke('sip:make-call', number),
    answerCall: (callId) => ipcRenderer.invoke('sip:answer-call', callId),
    hangupCall: (callId) => ipcRenderer.invoke('sip:hangup-call', callId),
    holdCall: (callId) => ipcRenderer.invoke('sip:hold-call', callId),
    unholdCall: (callId) => ipcRenderer.invoke('sip:unhold-call', callId),
    transferCall: (callId, target) => ipcRenderer.invoke('sip:transfer-call', callId, target),
    sendDtmf: (callId, digit) => ipcRenderer.invoke('sip:send-dtmf', callId, digit),
    muteCall: (callId, muted) => ipcRenderer.invoke('sip:mute-call', callId, muted),
    getActiveCalls: () => ipcRenderer.invoke('sip:get-active-calls'),
    getCall: (callId) => ipcRenderer.invoke('sip:get-call', callId),
    getLog: () => ipcRenderer.invoke('sip:get-log'),
    clearLog: () => ipcRenderer.invoke('sip:clear-log'),
    reconnect: () => ipcRenderer.invoke('sip:reconnect'),
    sendAudio: (callId, pcm) => {
      ipcRenderer.send('sip:audio-in', callId, pcm)
    },
    onAudio: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { callId: string; pcm: Uint8Array }) => {
        callback(data)
      }
      // Store for offAudio
      ;(ipcRenderer as unknown as { __audioHandler?: typeof handler }).__audioHandler = handler
      ipcRenderer.on('sip:audio-out', handler)
    },
    offAudio: () => {
      const handler = (ipcRenderer as unknown as { __audioHandler?: (...args: unknown[]) => void }).__audioHandler
      if (handler) {
        ipcRenderer.removeListener('sip:audio-out', handler)
        delete (ipcRenderer as unknown as { __audioHandler?: unknown }).__audioHandler
      }
    },
  },

  api: {
    sendWebhook: (event, data) => ipcRenderer.invoke('api:send-webhook', event, data),
  },

  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  },

  debug: {
    saveLog: (text) => ipcRenderer.invoke('debug:save-log', text),
    openLogsFolder: () => ipcRenderer.invoke('debug:open-logs-folder'),
    getLogFilePath: () => ipcRenderer.invoke('debug:get-log-file-path'),
  },

  ringtone: {
    list: () => ipcRenderer.invoke('ringtone:list'),
    import: () => ipcRenderer.invoke('ringtone:import'),
    readDataUrl: (filePath) => ipcRenderer.invoke('ringtone:read-data-url', filePath),
    resolve: (preset, customPath) => ipcRenderer.invoke('ringtone:resolve', preset, customPath),
  },

  on: (channel, callback) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback as (...args: unknown[]) => void)
  },
}

contextBridge.exposeInMainWorld('api', api)
