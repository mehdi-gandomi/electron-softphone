import Store from 'electron-store'
import type { AppSettings, SipAccount } from '../shared/types'

const defaults: AppSettings = {
  accounts: [],
  activeAccountId: '',
  ringtonePath: '',
  ringtonePreset: 'classic',
  ringtoneVolume: 0.7,
  micVolume: 0.8,
  speakerVolume: 0.8,
  inputDevice: '',
  outputDevice: '',
  dndEnabled: false,
  callForwardEnabled: false,
  callForwardNumber: '',
  autoAnswer: false,
  autoAnswerDelay: 0,
  enableLogging: false,
  enableTray: true,
  minimizeToTray: true,
  hotkeys: {
    answer: 'F2',
    hangup: 'F4',
    toggleMute: 'Ctrl+M',
  },
  apiIntegration: {
    enabled: false,
    webhookUrl: '',
    apiKey: '',
    events: {
      incomingCall: true,
      callAnswered: true,
      callEnded: true,
      callMissed: true,
    },
    autoFillFields: [
      { key: 'caller_id', label: 'Caller ID', source: 'caller_id' },
      { key: 'extension', label: 'Extension', source: 'extension' },
      { key: 'timestamp', label: 'Timestamp', source: 'timestamp' },
    ],
  },
  screenPop: {
    enabled: false,
    baseUrl: '',
    issabelHeader: 'X-UniqueID',
    params: [
      { name: 'phone', source: 'caller_id' },
      { name: 'extension', source: 'extension' },
      { name: 'issabel_id', source: 'issabel_id' },
      { name: 'answered', source: 'answer_datetime' },
    ],
  },
}

const store = new Store<AppSettings>({ name: 'voxphone-settings', defaults })

export function getSettings(): AppSettings {
  const settings = store.store
  // Migrate older installs that predate screenPop
  if (!settings.screenPop) {
    settings.screenPop = {
      enabled: false,
      baseUrl: '',
      issabelHeader: 'X-UniqueID',
      params: [
        { name: 'phone', source: 'caller_id' },
        { name: 'extension', source: 'extension' },
        { name: 'issabel_id', source: 'issabel_id' },
        { name: 'answered', source: 'answer_datetime' },
      ],
    }
  }
  return settings
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value)
}

export function addAccount(account: SipAccount): void {
  const accounts = store.get('accounts')
  accounts.push(account)
  store.set('accounts', accounts)
}

export function updateAccount(id: string, updates: Partial<SipAccount>): void {
  const accounts = store.get('accounts')
  const idx = accounts.findIndex(a => a.id === id)
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...updates }
    store.set('accounts', accounts)
  }
}

export function removeAccount(id: string): void {
  const accounts = store.get('accounts').filter(a => a.id !== id)
  store.set('accounts', accounts)
}

export function getActiveAccount(): SipAccount | undefined {
  const accounts = store.get('accounts')
  const activeId = store.get('activeAccountId')
  return accounts.find(a => a.id === activeId) || accounts[0]
}

export function setActiveAccount(id: string): void {
  store.set('activeAccountId', id)
}
