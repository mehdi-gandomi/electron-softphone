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
  apiIntegration: buildDefaults.apiIntegration,
  screenPop: buildDefaults.screenPop,
  socketServer: buildDefaults.socketServer,
  developerOverrides: false,
  userAccess: {
    status: 'needs_login',
    profile: null,
    selectedExtensionId: '',
  },
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
  if (!settings.userAccess) {
    settings.userAccess = {
      status: 'needs_login',
      profile: null,
      selectedExtensionId: '',
    }
    store.set('userAccess', settings.userAccess)
  } else if (typeof settings.userAccess.selectedExtensionId !== 'string') {
    settings.userAccess.selectedExtensionId = ''
    store.set('userAccess', settings.userAccess)
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
