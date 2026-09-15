import { useState, useEffect, useRef } from 'react'
import type { SipAccount, AppSettings, ScreenPopSettings, ScreenPopParam, ScreenPopParamSource, SocketServerSettings, UpdaterStatus } from '../../../shared/types'
import { randomId } from '../../lib/utils'
import { useTheme } from '../../lib/theme'
import { useI18n, type Locale } from '../../lib/i18n'
import { applyOutputSink } from '../../lib/audioDevices'
import { DebugLog } from '../debug/DebugLog'
import { AudioDevicePanel } from './AudioDevicePanel'

type SettingsTab = 'account' | 'audio' | 'advanced' | 'api' | 'update' | 'debug'

const DEV_UNLOCK_SESSION_KEY = 'voxphone-dev-unlocked'

export function Settings() {
  const { t, locale, setLocale } = useI18n()
  const [tab, setTab] = useState<SettingsTab>('account')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [accounts, setAccounts] = useState<SipAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState('')
  const [developerUnlocked, setDeveloperUnlocked] = useState(false)

  useEffect(() => {
    window.api.settings.get().then((s) => {
      const loaded = s as unknown as AppSettings
      setSettings(loaded)
      setAccounts(loaded.accounts || [])
      setActiveAccountId(loaded.activeAccountId || '')
      if (loaded.locale && loaded.locale !== locale) {
        setLocale(loaded.locale as Locale)
      }
    })
    window.api.settings.isDeveloperUnlocked().then((unlocked) => {
      if (unlocked) {
        setDeveloperUnlocked(true)
        sessionStorage.setItem(DEV_UNLOCK_SESSION_KEY, '1')
      } else {
        sessionStorage.removeItem(DEV_UNLOCK_SESSION_KEY)
        setDeveloperUnlocked(false)
      }
    }).catch(() => {
      sessionStorage.removeItem(DEV_UNLOCK_SESSION_KEY)
    })
  }, [])

  useEffect(() => {
    if (!developerUnlocked && tab === 'debug') {
      setTab('account')
    }
  }, [developerUnlocked, tab])

  const updateSettings = async (key: string, value: unknown) => {
    await window.api.settings.set(key, value)
    setSettings((prev) => prev ? { ...prev, [key]: value } as AppSettings : prev)
  }

  const handleDeveloperUnlockChange = (unlocked: boolean) => {
    setDeveloperUnlocked(unlocked)
    if (unlocked) {
      sessionStorage.setItem(DEV_UNLOCK_SESSION_KEY, '1')
    } else {
      sessionStorage.removeItem(DEV_UNLOCK_SESSION_KEY)
      if (tab === 'debug') setTab('account')
    }
  }

  const handleResetBuildDefaults = async () => {
    const refreshed = await window.api.settings.resetBuildDefaults() as unknown as AppSettings
    setSettings(refreshed)
  }

  const saveAccount = async (account: SipAccount) => {
    const exists = accounts.find(a => a.id === account.id)
    if (exists) {
      await window.api.accounts.update(account.id, account)
      setAccounts(accounts.map(a => a.id === account.id ? account : a))
    } else {
      await window.api.accounts.add(account)
      setAccounts([...accounts, account])
    }
    await window.api.accounts.setActive(account.id)
    setActiveAccountId(account.id)
    await updateSettings('activeAccountId', account.id)
    // Register immediately after save so packaged installs work without restart
    await window.api.sip.reconnect()
  }

  const deleteAccount = async (id: string) => {
    // Main process unregisters SIP if this was the active account
    await window.api.accounts.remove(id)
    const remaining = accounts.filter(a => a.id !== id)
    setAccounts(remaining)
    if (activeAccountId === id) {
      setActiveAccountId('')
      await updateSettings('activeAccountId', '')
    }
  }

  const unregisterAccount = async () => {
    await window.api.sip.unregister()
  }

  const registerAccount = async () => {
    await window.api.sip.reconnect()
  }

  const selectAccount = async (id: string) => {
    await window.api.accounts.setActive(id)
    setActiveAccountId(id)
    await updateSettings('activeAccountId', id)
    await window.api.sip.reconnect()
  }

  if (!settings) return <div className="text-text-muted text-sm p-4">{t('settings.loading')}</div>

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: t('settings.tab.account') },
    { id: 'audio', label: t('settings.tab.audio') },
    { id: 'advanced', label: t('settings.tab.advanced') },
    { id: 'update', label: t('settings.tab.update') },
    { id: 'api', label: t('settings.tab.api') },
    ...(developerUnlocked
      ? [{ id: 'debug' as const, label: t('settings.tab.debug') }]
      : []),
  ]

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-lg font-semibold text-text mb-4">{t('settings.title')}</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 bg-bg-surface rounded-xl">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              tab === tabItem.id
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'account' && (
          <AccountTab
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSelect={selectAccount}
            onSave={saveAccount}
            onDelete={deleteAccount}
            onRegister={registerAccount}
            onUnregister={unregisterAccount}
          />
        )}
        {tab === 'audio' && <AudioTab settings={settings} onUpdate={updateSettings} />}
        {tab === 'advanced' && (
          <AdvancedTab
            settings={settings}
            onUpdate={updateSettings}
            developerUnlocked={developerUnlocked}
            onDeveloperUnlockChange={handleDeveloperUnlockChange}
            onResetBuildDefaults={handleResetBuildDefaults}
          />
        )}
        {tab === 'update' && <UpdateTab />}
        {tab === 'api' && (
          <ApiTab
            settings={settings}
            onUpdate={updateSettings}
            developerUnlocked={developerUnlocked}
          />
        )}
        {tab === 'debug' && developerUnlocked && <DebugLog />}
      </div>
    </div>
  )
}

// ============================================================
// Account Tab
// ============================================================

function AccountTab({
  accounts,
  activeAccountId,
  onSelect,
  onSave,
  onDelete,
  onRegister,
  onUnregister,
}: {
  accounts: SipAccount[]
  activeAccountId: string
  onSelect: (id: string) => void
  onSave: (account: SipAccount) => void
  onDelete: (id: string) => void
  onRegister: () => void
  onUnregister: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<SipAccount | null>(null)
  const [showNew, setShowNew] = useState(false)

  const emptyAccount: SipAccount = {
    id: '',
    displayName: '',
    username: '',
    authUser: '',
    password: '',
    domain: '',
    sipServer: '',
    sipProxy: '',
    transport: 'udp',
    localPort: 5060,
    registerExpiry: 300,
    stunServer: '',
    codecs: ['PCMU', 'PCMA', 'opus'],
    enabled: true,
  }

  const handleSave = (account: SipAccount) => {
    onSave({ ...account, id: account.id || randomId() })
    setEditing(null)
    setShowNew(false)
  }

  return (
    <div className="space-y-4">
      {/* Account list */}
      <div className="space-y-2">
        {accounts.map((account) => {
          const isActive = activeAccountId === account.id
          return (
            <div
              key={account.id}
              className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                isActive
                  ? 'bg-accent/10 border-accent/30'
                  : 'bg-bg-surface border-border hover:border-border-hover'
              }`}
              onClick={() => onSelect(account.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {account.displayName || account.username}
                    {isActive && (
                      <span className="ms-2 text-[10px] text-accent font-normal">{t('settings.account.active')}</span>
                    )}
                  </p>
                  <p className="text-xs text-text-secondary font-mono truncate" dir="ltr">
                    {account.username}@{account.sipServer}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end flex-shrink-0">
                  {isActive && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRegister() }}
                        className="text-xs text-text-secondary hover:text-success transition-colors"
                      >
                        {t('settings.account.register')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnregister() }}
                        className="text-xs text-text-secondary hover:text-warning transition-colors"
                      >
                        {t('settings.account.unregister')}
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(account) }}
                    className="text-xs text-text-secondary hover:text-accent transition-colors"
                  >
                    {t('settings.account.edit')}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(account.id) }}
                    className="text-xs text-text-secondary hover:text-error transition-colors"
                  >
                    {t('settings.account.delete')}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => { setEditing(null); setShowNew(true) }}
        className="w-full p-3 rounded-xl border border-dashed border-border hover:border-accent/50 text-sm text-text-secondary hover:text-accent transition-all duration-150"
      >
        {t('settings.account.add')}
      </button>

      {/* Edit form */}
      {(editing || showNew) && (
        <AccountForm
          account={editing || emptyAccount}
          onSave={handleSave}
          onClose={() => { setEditing(null); setShowNew(false) }}
        />
      )}
    </div>
  )
}

function AccountForm({
  account,
  onSave,
  onClose,
}: {
  account: SipAccount
  onSave: (account: SipAccount) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState(account)

  const update = (key: keyof SipAccount, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm animate-fade-in"
      style={{ backgroundColor: 'var(--overlay-backdrop)' }}
    >
      <div className="w-[420px] max-h-[80vh] bg-bg-surface border border-border rounded-3xl p-6 shadow-elevated animate-scale-in overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text">
            {account.id ? t('settings.account.editTitle') : t('settings.account.newTitle')}
          </h2>
          <button onClick={onClose} className="title-bar-btn text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.displayName')}</label>
            <input type="text" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} className="input-field text-sm" placeholder={t('settings.account.displayNamePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.username')}</label>
              <input type="text" value={form.username} onChange={(e) => update('username', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.account.usernamePlaceholder')} required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.authUser')}</label>
              <input type="text" value={form.authUser} onChange={(e) => update('authUser', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.account.authUserPlaceholder')} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.password')}</label>
            <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="input-field text-sm" placeholder={t('settings.account.passwordPlaceholder')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.sipServer')}</label>
              <input type="text" value={form.sipServer} onChange={(e) => update('sipServer', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.account.sipServerPlaceholder')} required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.domain')}</label>
              <input type="text" value={form.domain} onChange={(e) => update('domain', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.account.optional')} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.sipProxy')}</label>
            <input type="text" value={form.sipProxy} onChange={(e) => update('sipProxy', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.account.optional')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.transport')}</label>
              <select value={form.transport} onChange={(e) => update('transport', e.target.value)} className="input-field text-sm">
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
                <option value="tls">TLS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.port')}</label>
              <input type="number" value={form.localPort} onChange={(e) => update('localPort', parseInt(e.target.value) || 5060)} className="input-field text-sm font-mono" placeholder="5060" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('settings.account.expiry')}</label>
            <input type="number" value={form.registerExpiry} onChange={(e) => update('registerExpiry', parseInt(e.target.value) || 300)} className="input-field text-sm font-mono" />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1 text-sm">{t('settings.account.cancel')}</button>
            <button onClick={() => onSave(form)} className="btn-primary flex-1 text-sm">{t('settings.account.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Audio Tab
// ============================================================

function AudioTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (key: string, value: unknown) => void }) {
  const { t } = useI18n()
  const [tones, setTones] = useState<Array<{ id: string; name: string; path: string; builtin: boolean }>>([])
  const [previewMsg, setPreviewMsg] = useState('')
  const previewRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    window.api.ringtone.list().then(setTones).catch(() => {})
    return () => {
      if (previewRef.current) {
        previewRef.current.pause()
        previewRef.current = null
      }
    }
  }, [])

  const preset = settings.ringtonePreset || 'classic'
  const selectedLabel =
    preset === 'custom'
      ? (settings.ringtonePath ? settings.ringtonePath.split(/[/\\]/).pop() : t('settings.audio.customFile'))
      : tones.find((tone) => tone.id === preset)?.name || t('settings.audio.classicBeep')

  const stopPreview = () => {
    if (previewRef.current) {
      previewRef.current.pause()
      previewRef.current = null
    }
  }

  const handleSelect = async (id: string) => {
    stopPreview()
    if (id.startsWith('custom:')) {
      const tone = tones.find((tone) => tone.id === id)
      await onUpdate('ringtonePreset', 'custom')
      if (tone?.path) await onUpdate('ringtonePath', tone.path)
    } else {
      await onUpdate('ringtonePreset', id)
      if (id !== 'custom') await onUpdate('ringtonePath', '')
    }
  }

  const handleUpload = async () => {
    const result = await window.api.ringtone.import()
    if (!result.success || !result.path) return
    const list = await window.api.ringtone.list()
    setTones(list)
    await onUpdate('ringtonePreset', 'custom')
    await onUpdate('ringtonePath', result.path)
    setPreviewMsg(t('settings.audio.imported', { name: result.name || '' }))
    setTimeout(() => setPreviewMsg(''), 2500)
  }

  const handlePreview = async () => {
    stopPreview()
    const volume = settings.ringtoneVolume ?? 0.7
    if (preset === 'classic') {
      // Short classic preview via Web Audio
      try {
        const ctx = new AudioContext()
        await applyOutputSink(ctx, settings.outputDevice)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 440
        gain.gain.value = volume * 0.2
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        osc.stop(ctx.currentTime + 0.5)
        setTimeout(() => ctx.close(), 600)
        setPreviewMsg(t('settings.audio.playingClassic'))
      } catch {
        setPreviewMsg(t('settings.audio.previewFailed'))
      }
      setTimeout(() => setPreviewMsg(''), 1500)
      return
    }

    const path = await window.api.ringtone.resolve(preset, settings.ringtonePath || '')
    if (!path) {
      setPreviewMsg(t('settings.audio.noFile'))
      setTimeout(() => setPreviewMsg(''), 2000)
      return
    }
    const data = await window.api.ringtone.readDataUrl(path)
    if (!data.success || !data.dataUrl) {
      setPreviewMsg(data.error || t('settings.audio.loadFailed'))
      setTimeout(() => setPreviewMsg(''), 2000)
      return
    }
    const audio = new Audio(data.dataUrl)
    audio.volume = Math.max(0, Math.min(1, volume))
    previewRef.current = audio
    audio.onended = () => setPreviewMsg('')
    try {
      await applyOutputSink(audio, settings.outputDevice)
      await audio.play()
      setPreviewMsg(t('settings.audio.playing'))
    } catch {
      setPreviewMsg(t('settings.audio.previewFailed'))
      setTimeout(() => setPreviewMsg(''), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.audio.devices')}>
        <AudioDevicePanel
          variant="inline"
          inputDevice={settings.inputDevice}
          outputDevice={settings.outputDevice}
          speakerVolume={settings.speakerVolume}
          onSelectInput={(id) => onUpdate('inputDevice', id)}
          onSelectOutput={(id) => onUpdate('outputDevice', id)}
        />
      </Section>

      <Section title={t('settings.audio.volume')}>
        <Slider label={t('settings.audio.mic')} value={settings.micVolume} onChange={(v) => onUpdate('micVolume', v)} />
        <Slider label={t('settings.audio.speaker')} value={settings.speakerVolume} onChange={(v) => onUpdate('speakerVolume', v)} />
        <Slider label={t('settings.audio.ringtone')} value={settings.ringtoneVolume} onChange={(v) => onUpdate('ringtoneVolume', v)} />
      </Section>

      <Section title={t('settings.audio.ringtoneSection')}>
        <p className="text-[11px] text-text-muted mb-3">
          {t('settings.audio.ringtoneHelp')}
        </p>
        <div className="space-y-2 mb-3">
          {tones.filter((tone) => tone.builtin).map((tone) => (
            <label
              key={tone.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                preset === tone.id ? 'border-accent bg-accent/10' : 'border-border hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                name="ringtone"
                checked={preset === tone.id}
                onChange={() => handleSelect(tone.id)}
                className="accent-accent"
              />
              <span className="text-sm text-text">{tone.name}</span>
              <span className="text-[10px] text-text-muted ms-auto">{t('settings.audio.builtin')}</span>
            </label>
          ))}
          <label
            className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
              preset === 'custom' ? 'border-accent bg-accent/10' : 'border-border hover:border-border-hover'
            }`}
          >
            <input
              type="radio"
              name="ringtone"
              checked={preset === 'custom'}
              onChange={() => handleSelect(tones.find((tone) => !tone.builtin)?.id || 'custom')}
              className="accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text">{t('settings.audio.customFile')}</div>
              <div className="text-[11px] text-text-muted truncate">{selectedLabel}</div>
            </div>
          </label>
          {tones.filter((tone) => !tone.builtin).map((tone) => (
            <label
              key={tone.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ms-4 ${
                preset === 'custom' && settings.ringtonePath === tone.path
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                name="ringtone-custom"
                checked={preset === 'custom' && settings.ringtonePath === tone.path}
                onChange={() => handleSelect(tone.id)}
                className="accent-accent"
              />
              <span className="text-sm text-text truncate">{tone.name}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleUpload} className="btn-primary text-xs py-1.5 px-3">
            {t('settings.audio.upload')}
          </button>
          <button type="button" onClick={handlePreview} className="btn-ghost text-xs py-1.5 px-3">
            {t('settings.audio.preview')}
          </button>
          <button type="button" onClick={stopPreview} className="btn-ghost text-xs py-1.5 px-3">
            {t('settings.audio.stop')}
          </button>
        </div>
        {previewMsg && <p className="text-[11px] text-text-muted mt-2">{previewMsg}</p>}
      </Section>

      <Section title={t('settings.audio.recordingSection')}>
        <p className="text-[11px] text-text-muted mb-3">
          {t('settings.audio.recordingHelp')}
        </p>
        <Toggle
          label={t('settings.audio.autoRecord')}
          checked={settings.autoRecordCalls !== false}
          onChange={(v) => onUpdate('autoRecordCalls', v)}
        />
        <Toggle
          label={t('settings.audio.recordingStereo')}
          checked={!!settings.recordingStereo}
          onChange={(v) => onUpdate('recordingStereo', v)}
        />
        <p className="text-[11px] text-text-muted -mt-2">
          {t('settings.audio.recordingStereoHelp')}
        </p>
        <div className="mt-3">
          <label className="block text-xs text-text-secondary mb-1.5">{t('settings.audio.recordingFolder')}</label>
          <p className="text-[11px] text-text-muted font-mono break-all mb-2" dir="ltr">
            {settings.recordingPath || t('settings.audio.recordingDefault')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-3"
              onClick={async () => {
                const result = await window.api.recording.pickFolder()
                if (result.success && result.path) await onUpdate('recordingPath', result.path)
              }}
            >
              {t('settings.audio.chooseFolder')}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs py-1.5 px-3"
              onClick={() => window.api.recording.openFolder()}
            >
              {t('settings.audio.openFolder')}
            </button>
            {settings.recordingPath ? (
              <button
                type="button"
                className="btn-ghost text-xs py-1.5 px-3"
                onClick={() => onUpdate('recordingPath', '')}
              >
                {t('settings.audio.resetFolder')}
              </button>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  )
}

// ============================================================
// Update Tab
// ============================================================

const emptyUpdaterStatus: UpdaterStatus = {
  currentVersion: '',
  latestVersion: null,
  releaseNotes: '',
  releaseUrl: '',
  state: 'idle',
  progress: 0,
  error: null,
  canInstall: false,
  packaged: false,
  portable: false,
}

function UpdateTab() {
  const { t } = useI18n()
  const [status, setStatus] = useState<UpdaterStatus>(emptyUpdaterStatus)

  useEffect(() => {
    let cancelled = false

    const apply = (next: UpdaterStatus) => {
      if (!cancelled) setStatus(next)
    }

    window.api.updater.status().then(apply).catch(() => {})
    window.api.updater.check().then(apply).catch(() => {})

    const stop = window.api.updater.onStatus(apply)
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const busy = status.state === 'checking' || status.state === 'downloading'

  const handleCheck = async () => {
    const next = await window.api.updater.check()
    setStatus(next)
  }

  const handleDownload = async () => {
    const next = await window.api.updater.download()
    setStatus(next)
  }

  const handleInstall = async () => {
    const result = await window.api.updater.install()
    if (!result.success && result.error) {
      setStatus((prev) => ({ ...prev, state: 'error', error: result.error || prev.error }))
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.tab.update')}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">{t('settings.update.current')}</span>
          <span className="font-mono text-text" dir="ltr">{status.currentVersion || '—'}</span>
        </div>
        {status.latestVersion && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-text-secondary">{t('settings.update.latest')}</span>
            <span className="font-mono text-text" dir="ltr">{status.latestVersion}</span>
          </div>
        )}

        {status.state === 'unavailable' && (
          <p className="text-sm text-success">{t('settings.update.upToDate')}</p>
        )}
        {status.state === 'available' && (
          <p className="text-sm text-accent">{t('settings.update.available')}</p>
        )}
        {status.state === 'error' && (
          <p className="text-sm text-error">
            {t('settings.update.error')}
            {status.error ? `: ${status.error}` : ''}
          </p>
        )}

        {!status.packaged && (
          <p className="text-[11px] text-text-muted leading-relaxed">{t('settings.update.devMode')}</p>
        )}
        {status.packaged && status.portable && (
          <p className="text-[11px] text-text-muted leading-relaxed">{t('settings.update.portable')}</p>
        )}

        {status.state === 'downloading' && (
          <div>
            <p className="text-xs text-text-secondary mb-1">
              {t('settings.update.downloading', { percent: status.progress })}
            </p>
            <div className="h-1.5 rounded-full bg-bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.max(2, status.progress)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {status.state === 'ready' && status.canInstall ? (
            <button type="button" onClick={() => void handleInstall()} className="btn-primary text-sm py-2">
              {t('settings.update.install')}
            </button>
          ) : status.state === 'available' && status.canInstall ? (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={busy}
              className="btn-primary text-sm py-2 disabled:opacity-60"
            >
              {t('settings.update.download')}
            </button>
          ) : status.state === 'available' ? (
            <button type="button" onClick={() => void window.api.updater.openRelease()} className="btn-primary text-sm py-2">
              {t('settings.update.openRelease')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCheck()}
              disabled={busy}
              className="btn-primary text-sm py-2 disabled:opacity-60"
            >
              {busy && status.state === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
            </button>
          )}
          {!(status.state === 'available' && !status.canInstall) && (
            <button type="button" onClick={() => void window.api.updater.openRelease()} className="btn-ghost text-sm py-2">
              {t('settings.update.openRelease')}
            </button>
          )}
        </div>
      </Section>

      <Section title={t('settings.update.changelog')}>
        <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed" dir="auto">
          {status.releaseNotes || t('settings.update.noNotes')}
        </div>
      </Section>
    </div>
  )
}

// ============================================================
// Advanced Tab
// ============================================================

function AdvancedTab({
  settings,
  onUpdate,
  developerUnlocked,
  onDeveloperUnlockChange,
  onResetBuildDefaults,
}: {
  settings: AppSettings
  onUpdate: (key: string, value: unknown) => void
  developerUnlocked: boolean
  onDeveloperUnlockChange: (unlocked: boolean) => void
  onResetBuildDefaults: () => Promise<void>
}) {
  const { theme, setTheme } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const [devKey, setDevKey] = useState('')
  const [devError, setDevError] = useState('')
  const [resetting, setResetting] = useState(false)

  const handleLocale = (lang: Locale) => {
    setLocale(lang)
    onUpdate('locale', lang)
  }

  const handleUnlock = async () => {
    setDevError('')
    const result = await window.api.settings.unlockDeveloper(devKey)
    if (result.success) {
      setDevKey('')
      onDeveloperUnlockChange(true)
    } else {
      setDevError(t('settings.advanced.devKeyInvalid'))
    }
  }

  const handleLock = async () => {
    await window.api.settings.lockDeveloper()
    onDeveloperUnlockChange(false)
    setDevKey('')
    setDevError('')
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await onResetBuildDefaults()
    } finally {
      setResetting(false)
    }
  }

  const [tlsInstalled, setTlsInstalled] = useState<boolean | null>(null)
  const [tlsBusy, setTlsBusy] = useState(false)
  const [tlsMessage, setTlsMessage] = useState('')
  const [ffConfigured, setFfConfigured] = useState<boolean | null>(null)
  const [ffBusy, setFfBusy] = useState(false)
  const [ffRestartBusy, setFfRestartBusy] = useState(false)
  const [ffMessage, setFfMessage] = useState('')

  const refreshTlsStatus = () => {
    window.api.socket
      .tlsStatus()
      .then((s) => {
        setTlsInstalled(!!s.installed)
        if (s.error && !s.installed) setTlsMessage(s.error)
      })
      .catch(() => setTlsInstalled(false))
  }

  const refreshFirefoxStatus = () => {
    window.api.socket
      .firefoxEnterpriseRootsStatus()
      .then((s) => {
        setFfConfigured(!!s.configured)
        if (s.detail && !s.configured) setFfMessage(s.detail)
      })
      .catch(() => setFfConfigured(false))
  }

  useEffect(() => {
    refreshTlsStatus()
    refreshFirefoxStatus()
  }, [])

  const handleInstallTls = async () => {
    const ok = window.confirm(t('settings.advanced.socketTlsConfirm'))
    if (!ok) return
    setTlsBusy(true)
    setTlsMessage('')
    try {
      const result = await window.api.socket.installTlsCert()
      if (result.success) {
        setTlsInstalled(true)
        setTlsMessage(
          result.alreadyInstalled
            ? t('settings.advanced.socketTlsAlready')
            : t('settings.advanced.socketTlsInstalled')
        )
      } else {
        setTlsInstalled(false)
        setTlsMessage(result.error || t('settings.advanced.socketTlsFailed'))
      }
    } catch (err) {
      setTlsInstalled(false)
      setTlsMessage(err instanceof Error ? err.message : t('settings.advanced.socketTlsFailed'))
    } finally {
      setTlsBusy(false)
      refreshTlsStatus()
    }
  }

  const handleFirefoxEnterpriseRoots = async () => {
    const ok = window.confirm(t('settings.advanced.firefoxRootsConfirm'))
    if (!ok) return
    setFfBusy(true)
    setFfMessage('')
    try {
      const result = await window.api.socket.enableFirefoxEnterpriseRoots()
      if (result.success) {
        setFfConfigured(true)
        setFfMessage(result.message || t('settings.advanced.firefoxRootsDone'))
      } else {
        setFfConfigured(false)
        setFfMessage(result.error || t('settings.advanced.firefoxRootsFailed'))
      }
    } catch (err) {
      setFfConfigured(false)
      setFfMessage(err instanceof Error ? err.message : t('settings.advanced.firefoxRootsFailed'))
    } finally {
      setFfBusy(false)
      refreshFirefoxStatus()
    }
  }

  const handleRestartFirefox = async () => {
    const ok = window.confirm(t('settings.advanced.firefoxRestartConfirm'))
    if (!ok) return
    setFfRestartBusy(true)
    setFfMessage('')
    try {
      const result = await window.api.socket.restartFirefox()
      if (result.success) {
        setFfMessage(result.message || t('settings.advanced.firefoxRestartDone'))
      } else {
        setFfMessage(result.error || t('settings.advanced.firefoxRestartFailed'))
      }
    } catch (err) {
      setFfMessage(err instanceof Error ? err.message : t('settings.advanced.firefoxRestartFailed'))
    } finally {
      setFfRestartBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.advanced.language')}>
        <p className="text-xs text-text-muted mb-3">
          {t('settings.advanced.languageHelp')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleLocale('fa')}
            className={`rounded-xl border p-3 text-start transition-all ${
              locale === 'fa'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border hover:border-border-hover text-text-secondary'
            }`}
          >
            <div className="text-sm font-semibold">{t('settings.advanced.langFa')}</div>
          </button>
          <button
            type="button"
            onClick={() => handleLocale('en')}
            className={`rounded-xl border p-3 text-start transition-all ${
              locale === 'en'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border hover:border-border-hover text-text-secondary'
            }`}
          >
            <div className="text-sm font-semibold">{t('settings.advanced.langEn')}</div>
          </button>
        </div>
      </Section>

      <Section title={t('settings.advanced.theme')}>
        <p className="text-xs text-text-muted mb-3">
          {t('settings.advanced.themeHelp')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`rounded-xl border p-3 text-start transition-all ${
              theme === 'dark'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border hover:border-border-hover text-text-secondary'
            }`}
          >
            <div className="text-sm font-semibold">{t('settings.advanced.themeDark')}</div>
            <div className="text-[10px] mt-0.5 opacity-80">{t('settings.advanced.themeDarkSub')}</div>
          </button>
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`rounded-xl border p-3 text-start transition-all ${
              theme === 'light'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border hover:border-border-hover text-text-secondary'
            }`}
          >
            <div className="text-sm font-semibold">{t('settings.advanced.themeLight')}</div>
            <div className="text-[10px] mt-0.5 opacity-80">{t('settings.advanced.themeLightSub')}</div>
          </button>
        </div>
      </Section>

      <Section title={t('settings.advanced.behavior')}>
        <Toggle label={t('settings.advanced.dnd')} checked={settings.dndEnabled} onChange={(v) => onUpdate('dndEnabled', v)} />
        <Toggle label={t('settings.advanced.autoAnswer')} checked={settings.autoAnswer} onChange={(v) => onUpdate('autoAnswer', v)} />
        <Toggle label={t('settings.advanced.minimizeTray')} checked={settings.minimizeToTray} onChange={(v) => onUpdate('minimizeToTray', v)} />
        <Toggle label={t('settings.advanced.debugLogging')} checked={settings.enableLogging} onChange={(v) => onUpdate('enableLogging', v)} />
        <p className="text-[11px] text-text-muted -mt-2">
          {t('settings.advanced.debugHelp')}
        </p>
      </Section>

      <Section title={t('settings.advanced.forwarding')}>
        <Toggle label={t('settings.advanced.enableForward')} checked={settings.callForwardEnabled} onChange={(v) => onUpdate('callForwardEnabled', v)} />
        {settings.callForwardEnabled && (
          <div className="mt-3">
            <input type="text" value={settings.callForwardNumber} onChange={(e) => onUpdate('callForwardNumber', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.advanced.forwardPlaceholder')} />
          </div>
        )}
      </Section>

      <Section title={t('settings.advanced.socketTls')}>
        <p className="text-xs text-text-muted mb-3">{t('settings.advanced.socketTlsHelp')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleInstallTls()}
            disabled={tlsBusy || tlsInstalled === true}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            {tlsBusy
              ? t('settings.advanced.socketTlsInstalling')
              : tlsInstalled
                ? t('settings.advanced.socketTlsTrusted')
                : t('settings.advanced.socketTlsInstall')}
          </button>
          {tlsInstalled === true && (
            <span className="text-[11px] text-success">{t('settings.advanced.socketTlsTrusted')}</span>
          )}
          {tlsInstalled === false && (
            <span className="text-[11px] text-text-muted">{t('settings.advanced.socketTlsNotTrusted')}</span>
          )}
        </div>
        {tlsMessage ? (
          <p className={`text-[11px] mt-2 leading-relaxed ${tlsInstalled ? 'text-success' : 'text-error'}`}>
            {tlsMessage}
          </p>
        ) : null}

        <div className="mt-4 pt-3 border-t border-border space-y-2">
          <p className="text-xs text-text-secondary leading-relaxed">{t('settings.advanced.firefoxRootsHelp')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title={t('settings.advanced.firefoxRootsHint')}
              onClick={() => void handleFirefoxEnterpriseRoots()}
              disabled={ffBusy || ffRestartBusy}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
            >
              {ffBusy
                ? t('settings.advanced.firefoxRootsWorking')
                : ffConfigured
                  ? t('settings.advanced.firefoxRootsAgain')
                  : t('settings.advanced.firefoxRootsEnable')}
            </button>
            <button
              type="button"
              title={t('settings.advanced.firefoxRestartHint')}
              onClick={() => void handleRestartFirefox()}
              disabled={ffBusy || ffRestartBusy}
              className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
            >
              {ffRestartBusy
                ? t('settings.advanced.firefoxRestartWorking')
                : t('settings.advanced.firefoxRestart')}
            </button>
            {ffConfigured === true && (
              <span className="text-[11px] text-success">{t('settings.advanced.firefoxRootsConfigured')}</span>
            )}
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            {t('settings.advanced.firefoxRootsHint')}
          </p>
          {ffMessage ? (
            <p className={`text-[11px] leading-relaxed ${ffConfigured || /reopen|باز|restart|quit/i.test(ffMessage) ? 'text-success' : 'text-error'}`}>
              {ffMessage}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title={t('settings.advanced.developer')}>
        <p className="text-xs text-text-muted mb-3">{t('settings.advanced.developerHelp')}</p>
        {developerUnlocked ? (
          <div className="space-y-3">
            <p className="text-xs text-success font-medium">{t('settings.advanced.devUnlocked')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleLock} className="btn-secondary text-xs py-1.5 px-3">
                {t('settings.advanced.devLock')}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {resetting ? t('settings.advanced.devResetting') : t('settings.advanced.devReset')}
              </button>
            </div>
            {settings.developerOverrides && (
              <p className="text-[11px] text-text-muted">{t('settings.advanced.devOverridesActive')}</p>
            )}
            <div className="pt-2 border-t border-border">
              <label className="block text-xs text-text-secondary mb-1.5">
                {t('settings.advanced.shiftCheckInterval')}
              </label>
              <p className="text-[11px] text-text-muted mb-2">
                {t('settings.advanced.shiftCheckIntervalHelp')}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={settings.shiftCheckIntervalMinutes ?? 10}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value))
                    if (!Number.isFinite(n)) return
                    onUpdate(
                      'shiftCheckIntervalMinutes',
                      Math.max(1, Math.min(1440, n))
                    )
                  }}
                  className="input-field text-sm font-mono w-28"
                  dir="ltr"
                />
                <span className="text-xs text-text-muted">
                  {t('settings.advanced.shiftCheckIntervalUnit')}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs text-text-secondary">{t('settings.advanced.devKey')}</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={devKey}
                onChange={(e) => { setDevKey(e.target.value); setDevError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
                className="input-field text-sm flex-1"
                placeholder={t('settings.advanced.devKeyPlaceholder')}
                autoComplete="off"
              />
              <button type="button" onClick={() => void handleUnlock()} className="btn-primary text-xs py-1.5 px-3 flex-shrink-0">
                {t('settings.advanced.devUnlock')}
              </button>
            </div>
            {devError && <p className="text-xs text-error">{devError}</p>}
          </div>
        )}
      </Section>
    </div>
  )
}

// ============================================================
// API Tab
// ============================================================

function ApiTab({
  settings,
  onUpdate,
  developerUnlocked,
}: {
  settings: AppSettings
  onUpdate: (key: string, value: unknown) => void
  developerUnlocked: boolean
}) {
  const { t } = useI18n()
  const canEditDev = developerUnlocked
  const api = settings.apiIntegration
  const screenPop: ScreenPopSettings = settings.screenPop || {
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
  const socketServer: SocketServerSettings = settings.socketServer || {
    enabled: false,
    host: '0.0.0.0',
    port: 3920,
    authToken: '',
  }

  const [socketStatus, setSocketStatus] = useState<{
    running: boolean
    httpsRunning: boolean
    enabled: boolean
    detail: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const s = await window.api.socket.status()
        if (cancelled) return
        setSocketStatus({
          running: Boolean(s.running),
          httpsRunning: Boolean(s.httpsRunning),
          enabled: Boolean(s.enabled),
          detail: s.detail || '',
        })
      } catch {
        if (!cancelled) setSocketStatus(null)
      }
    }
    void poll()
    const id = setInterval(() => void poll(), 1500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [socketServer.enabled, socketServer.port])

  const updateApi = (key: string, value: unknown) => {
    if (!canEditDev) return
    onUpdate('apiIntegration', { ...api, [key]: value })
  }

  const updateEvent = (key: string, value: boolean) => {
    if (!canEditDev) return
    updateApi('events', { ...api.events, [key]: value })
  }

  const updateScreenPop = (patch: Partial<ScreenPopSettings>) => {
    if (!canEditDev) return
    onUpdate('screenPop', { ...screenPop, ...patch })
  }

  /** Socket enable is always editable; host/port/token stay developer-only. */
  const updateSocket = (patch: Partial<SocketServerSettings>) => {
    const next = { ...socketServer, ...patch }
    if (!canEditDev) {
      onUpdate('socketServer', {
        ...socketServer,
        enabled: Boolean(next.enabled),
      })
      return
    }
    onUpdate('socketServer', next)
  }

  const updateParam = (index: number, patch: Partial<ScreenPopParam>) => {
    if (!canEditDev) return
    const params = screenPop.params.map((p, i) => (i === index ? { ...p, ...patch } : p))
    updateScreenPop({ params })
  }

  const addParam = () => {
    if (!canEditDev) return
    updateScreenPop({
      params: [...screenPop.params, { name: '', source: 'caller_id' }],
    })
  }

  const removeParam = (index: number) => {
    if (!canEditDev) return
    updateScreenPop({ params: screenPop.params.filter((_, i) => i !== index) })
  }

  const sourceOptions: { value: ScreenPopParamSource; label: string }[] = [
    { value: 'caller_id', label: t('settings.api.src.caller_id') },
    { value: 'caller_name', label: t('settings.api.src.caller_name') },
    { value: 'extension', label: t('settings.api.src.extension') },
    { value: 'issabel_id', label: t('settings.api.src.issabel_id') },
    { value: 'call_id', label: t('settings.api.src.call_id') },
    { value: 'direction', label: t('settings.api.src.direction') },
    { value: 'answer_date', label: t('settings.api.src.answer_date') },
    { value: 'answer_time', label: t('settings.api.src.answer_time') },
    { value: 'answer_datetime', label: t('settings.api.src.answer_datetime') },
    { value: 'custom', label: t('settings.api.src.custom') },
  ]

  const socketPort = socketServer.port || 3920
  const socketHttpsPort = socketPort + 1
  const socketUrl = `http://127.0.0.1:${socketPort}`
  const socketHttpsUrl = `https://127.0.0.1:${socketHttpsPort}`

  return (
    <div className="space-y-6">
      <Section title={t('settings.api.socket')}>
        <p className="text-xs text-text-muted mb-3">{t('settings.api.socketHelp')}</p>
        <Toggle
          label={t('settings.api.enableSocket')}
          checked={socketServer.enabled}
          onChange={(v) => updateSocket({ enabled: v })}
        />
        <div className="mt-3 space-y-3">
          {canEditDev && (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.socketHost')}</label>
                  <input
                    type="text"
                    value={socketServer.host}
                    onChange={(e) => updateSocket({ host: e.target.value })}
                    className="input-field text-sm font-mono"
                    placeholder="0.0.0.0"
                    dir="ltr"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.socketPort')}</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={socketServer.port}
                    onChange={(e) => updateSocket({ port: Number(e.target.value) || 3920 })}
                    className="input-field text-sm font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.socketToken')}</label>
                <input
                  type="password"
                  value={socketServer.authToken}
                  onChange={(e) => updateSocket({ authToken: e.target.value })}
                  className="input-field text-sm"
                  placeholder={t('settings.account.optional')}
                />
              </div>
            </>
          )}

          <div className="rounded-lg border border-border/60 bg-bg/40 px-3 py-2 space-y-1.5" dir="ltr">
            <p className="text-[11px] text-text-secondary">
              <span className="text-text-muted">{t('settings.api.socketStatus')}: </span>
              {socketStatus
                ? socketServer.enabled
                  ? [
                      socketStatus.running ? `HTTP :${socketPort} OK` : `HTTP :${socketPort} DOWN`,
                      socketStatus.httpsRunning
                        ? `HTTPS/WSS :${socketHttpsPort} OK`
                        : `HTTPS/WSS :${socketHttpsPort} DOWN`,
                    ].join(' · ')
                  : t('settings.api.socketStatusOff')
                : '…'}
            </p>
            {socketStatus?.detail ? (
              <p className="text-[10px] text-text-muted font-mono">{socketStatus.detail}</p>
            ) : null}
          </div>

          <p className="text-[11px] text-text-muted font-mono leading-relaxed" dir="ltr">
            {t('settings.api.socketHttpOnly')}: {socketUrl}
            <br />
            {t('settings.api.socketHttpsOnly')}: {socketHttpsUrl}
            <br />
            {t('settings.api.socketEventHint')}: incoming_call, call_answered, call_ended, nuisance_report
          </p>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {t('settings.api.socketHttpsHelp')}
          </p>
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-3"
            onClick={() => void window.api.socket.openHttpsTrustPage()}
          >
            {t('settings.api.openHttpsTrust')}
          </button>
        </div>
      </Section>

      {canEditDev && (
        <>
          <Section title={t('settings.api.webhook')}>
            <Toggle label={t('settings.api.enable')} checked={api.enabled} onChange={(v) => updateApi('enabled', v)} />
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.webhookUrl')}</label>
                <input type="url" value={api.webhookUrl} onChange={(e) => updateApi('webhookUrl', e.target.value)} className="input-field text-sm font-mono" placeholder={t('settings.api.webhookPlaceholder')} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.apiKey')}</label>
                <input type="password" value={api.apiKey} onChange={(e) => updateApi('apiKey', e.target.value)} className="input-field text-sm" placeholder={t('settings.account.optional')} />
              </div>
            </div>
          </Section>

          <Section title={t('settings.api.events')}>
            <Toggle label={t('settings.api.eventIncoming')} checked={api.events.incomingCall} onChange={(v) => updateEvent('incomingCall', v)} />
            <Toggle label={t('settings.api.eventAnswered')} checked={api.events.callAnswered} onChange={(v) => updateEvent('callAnswered', v)} />
            <Toggle label={t('settings.api.eventEnded')} checked={api.events.callEnded} onChange={(v) => updateEvent('callEnded', v)} />
            <Toggle label={t('settings.api.eventMissed')} checked={api.events.callMissed} onChange={(v) => updateEvent('callMissed', v)} />
          </Section>

          <Section title={t('settings.api.autofill')}>
            <p className="text-xs text-text-muted mb-3">{t('settings.api.autofillHelp')}</p>
            {api.autoFillFields.map((field, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input type="text" value={field.label} readOnly className="input-field text-xs flex-1" />
                <select value={field.source} className="input-field text-xs w-32">
                  <option value="caller_id">{t('settings.api.src.caller_id')}</option>
                  <option value="extension">{t('settings.api.src.extension')}</option>
                  <option value="timestamp">{t('settings.api.src.timestamp')}</option>
                  <option value="custom">{t('settings.api.src.custom')}</option>
                </select>
              </div>
            ))}
          </Section>

          <Section title={t('settings.api.screenPop')}>
            <p className="text-xs text-text-muted mb-3">
              {t('settings.api.screenPopHelp')}{' '}
              <span className="font-mono">Set(PJSIP_HEADER(add,X-UniqueID)=${'${CHANNEL(uniqueid)}'})</span>.
            </p>
            <Toggle label={t('settings.api.enableScreenPop')} checked={screenPop.enabled} onChange={(v) => updateScreenPop({ enabled: v })} />
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.baseUrl')}</label>
                <input
                  type="url"
                  value={screenPop.baseUrl}
                  onChange={(e) => updateScreenPop({ baseUrl: e.target.value })}
                  className="input-field text-sm font-mono"
                  placeholder={t('settings.api.baseUrlPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('settings.api.issabelHeader')}</label>
                <input
                  type="text"
                  value={screenPop.issabelHeader}
                  onChange={(e) => updateScreenPop({ issabelHeader: e.target.value })}
                  className="input-field text-sm font-mono"
                  placeholder="X-UniqueID"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-text-secondary">{t('settings.api.getParams')}</label>
                  <button type="button" onClick={addParam} className="text-xs text-accent hover:underline">
                    {t('settings.api.addParam')}
                  </button>
                </div>
                {screenPop.params.map((param, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={param.name}
                      onChange={(e) => updateParam(i, { name: e.target.value })}
                      className="input-field text-xs flex-1 font-mono"
                      placeholder={t('settings.api.paramPlaceholder')}
                    />
                    <select
                      value={param.source}
                      onChange={(e) => updateParam(i, { source: e.target.value as ScreenPopParamSource })}
                      className="input-field text-xs w-36"
                    >
                      {sourceOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {param.source === 'custom' && (
                      <input
                        type="text"
                        value={param.customValue || ''}
                        onChange={(e) => updateParam(i, { customValue: e.target.value })}
                        className="input-field text-xs flex-1"
                        placeholder={t('settings.api.customValue')}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeParam(i)}
                      className="text-xs text-text-muted hover:text-danger px-1"
                      title={t('settings.api.remove')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

// ============================================================
// Shared Components
// ============================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{title}</h3>
      <div className="p-4 bg-bg-surface rounded-xl border border-border space-y-4">
        {children}
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <span className="text-sm text-text">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked)
        }}
        className={`flex items-center w-10 h-6 p-1 rounded-full flex-shrink-0 transition-colors duration-200 disabled:cursor-not-allowed ${
          checked ? 'justify-end bg-accent' : 'justify-start bg-bg-surface-2'
        }`}
      >
        <span className="block w-4 h-4 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text">{label}</span>
        <span className="text-xs text-text-muted font-mono">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-bg-surface-2 rounded-full appearance-none cursor-pointer accent-accent"
      />
    </div>
  )
}
