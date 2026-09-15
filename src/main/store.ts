import Store from 'electron-store'
import type { AppSettings, SipAccount } from '../shared/types'
import { getBuildIntegrationDefaults } from '../shared/buildConfig'

const buildDefaults = getBuildIntegrationDefaults()

const defaults: AppSettings = {
  accounts: [],
  activeAccountId: '',
  locale: 'fa',
  ringtonePath: '',
  ringtonePreset: 'classic',
  ringtoneVolume: 0.7,
  micVolume: 1,
  speakerVolume: 1,
  inputDevice: '',
  outputDevice: '',
  dndEnabled: false,
  callForwardEnabled: false,
  callForwardNumber: '',
  autoAnswer: false,
  autoAnswerDelay: 0,
  autoRecordCalls: true,
  recordingStereo: false,
  recordingPath: '',
  enableLogging: false,
  enableTray: true,
  minimizeToTray: true,
  hotkeys: {
    answer: 'F2',
    hangup: 'F4',
    toggleMute: 'Ctrl+M',
  },
  apiIntegration: buildDefaults.apiIntegration,
  screenPop: buildDefaults.screenPop,
  socketServer: buildDefaults.socketServer,
  developerOverrides: false,
  shiftCheckIntervalMinutes: 10,
  userAccess: {
    status: 'needs_login',
    profile: null,
    selectedExtensionId: '',
    reservedExtension: null,
  },
  latestShiftLookup: null,
  authSession: null,
}

const store = new Store<AppSettings>({ name: 'voxphone-settings', defaults })

function applyBuildIntegrations(): void {
  const fromBuild = getBuildIntegrationDefaults()
  store.set('apiIntegration', fromBuild.apiIntegration)
  store.set('screenPop', fromBuild.screenPop)
  store.set('socketServer', fromBuild.socketServer)
}

export function getSettings(): AppSettings {
  const settings = store.store
  if (!settings.locale) {
    settings.locale = 'fa'
  }
  // Migrate older installs that predate screenPop
  if (!settings.screenPop) {
    settings.screenPop = getBuildIntegrationDefaults().screenPop
  }
  if (!settings.socketServer) {
    settings.socketServer = getBuildIntegrationDefaults().socketServer
  }
  if (typeof settings.developerOverrides !== 'boolean') {
    settings.developerOverrides = false
    store.set('developerOverrides', false)
  }
  {
    const mins = Number(settings.shiftCheckIntervalMinutes)
    if (!Number.isFinite(mins) || mins < 1) {
      settings.shiftCheckIntervalMinutes = 10
      store.set('shiftCheckIntervalMinutes', 10)
    } else {
      settings.shiftCheckIntervalMinutes = Math.min(1440, Math.floor(mins))
    }
  }
  if (!settings.userAccess) {
    settings.userAccess = {
      status: 'needs_login',
      profile: null,
      selectedExtensionId: '',
      reservedExtension: null,
    }
    store.set('userAccess', settings.userAccess)
  } else if (typeof settings.userAccess.selectedExtensionId !== 'string') {
    settings.userAccess.selectedExtensionId = ''
    store.set('userAccess', settings.userAccess)
  }
  if (settings.userAccess && typeof settings.userAccess.reservedExtension === 'undefined') {
    settings.userAccess.reservedExtension = null
    store.set('userAccess', settings.userAccess)
  }
  if (typeof settings.latestShiftLookup === 'undefined') {
    settings.latestShiftLookup = null
    store.set('latestShiftLookup', null)
  }
  if (typeof settings.authSession === 'undefined') {
    settings.authSession = null
    store.set('authSession', null)
  }
  if (typeof settings.autoRecordCalls !== 'boolean') {
    settings.autoRecordCalls = true
    store.set('autoRecordCalls', true)
  }
  if (typeof settings.recordingStereo !== 'boolean') {
    settings.recordingStereo = false
    store.set('recordingStereo', false)
  }
  if (typeof settings.recordingPath !== 'string') {
    settings.recordingPath = ''
    store.set('recordingPath', '')
  }
  // Default mic/speaker to max; bump older 0.8 defaults to 1
  if (typeof settings.micVolume !== 'number' || settings.micVolume === 0.8) {
    settings.micVolume = 1
    store.set('micVolume', 1)
  }
  if (typeof settings.speakerVolume !== 'number' || settings.speakerVolume === 0.8) {
    settings.speakerVolume = 1
    store.set('speakerVolume', 1)
  }
  if (settings.locale !== 'fa' && settings.locale !== 'en') {
    settings.locale = 'fa'
  }

  // Normal users: build.json wins every launch until a developer saves overrides
  if (!settings.developerOverrides) {
    applyBuildIntegrations()
    return store.store
  }

  return settings
}

export function resetToBuildDefaults(): AppSettings {
  store.set('developerOverrides', false)
  applyBuildIntegrations()
  return getSettings()
}

export function markDeveloperOverrides(): void {
  store.set('developerOverrides', true)
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
