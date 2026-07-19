import { useState, useEffect, useRef } from 'react'
import type { SipAccount, AppSettings, ScreenPopSettings, ScreenPopParam, ScreenPopParamSource } from '../../../shared/types'
import { randomId } from '../../lib/utils'
import { DebugLog } from '../debug/DebugLog'

type SettingsTab = 'account' | 'audio' | 'advanced' | 'api' | 'debug'

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>('account')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [accounts, setAccounts] = useState<SipAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState('')

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setSettings(s as unknown as AppSettings)
      setAccounts((s as unknown as AppSettings).accounts || [])
      setActiveAccountId((s as unknown as AppSettings).activeAccountId || '')
    })
  }, [])

  const updateSettings = async (key: string, value: unknown) => {
    await window.api.settings.set(key, value)
    setSettings((prev) => prev ? { ...prev, [key]: value } as AppSettings : prev)
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

  if (!settings) return <div className="text-text-muted text-sm p-4">Loading...</div>

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'audio', label: 'Audio' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'api', label: 'API' },
    { id: 'debug', label: 'Debug' },
  ]

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-lg font-semibold text-text mb-4">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-bg-surface rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              tab === t.id
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {t.label}
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
        {tab === 'advanced' && <AdvancedTab settings={settings} onUpdate={updateSettings} />}
        {tab === 'api' && <ApiTab settings={settings} onUpdate={updateSettings} />}
        {tab === 'debug' && <DebugLog />}
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
                      <span className="ml-2 text-[10px] text-accent font-normal">Active</span>
                    )}
                  </p>
                  <p className="text-xs text-text-secondary font-mono truncate">
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
                        Register
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnregister() }}
                        className="text-xs text-text-secondary hover:text-warning transition-colors"
                      >
                        Unregister
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(account) }}
                    className="text-xs text-text-secondary hover:text-accent transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(account.id) }}
                    className="text-xs text-text-secondary hover:text-error transition-colors"
                  >
                    Delete
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
        + Add Account
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
  const [form, setForm] = useState(account)

  const update = (key: keyof SipAccount, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[420px] max-h-[80vh] bg-bg-surface border border-border rounded-3xl p-6 shadow-2xl animate-scale-in overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text">
            {account.id ? 'Edit Account' : 'New Account'}
          </h2>
          <button onClick={onClose} className="title-bar-btn text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Display Name</label>
            <input type="text" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} className="input-field text-sm" placeholder="John Smith" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Extension / Username *</label>
              <input type="text" value={form.username} onChange={(e) => update('username', e.target.value)} className="input-field text-sm font-mono" placeholder="1001" required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Auth User</label>
              <input type="text" value={form.authUser} onChange={(e) => update('authUser', e.target.value)} className="input-field text-sm font-mono" placeholder="Same as username" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Password *</label>
            <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="input-field text-sm" placeholder="Password" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">SIP Server *</label>
              <input type="text" value={form.sipServer} onChange={(e) => update('sipServer', e.target.value)} className="input-field text-sm font-mono" placeholder="192.168.1.100" required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Domain</label>
              <input type="text" value={form.domain} onChange={(e) => update('domain', e.target.value)} className="input-field text-sm font-mono" placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">SIP Proxy</label>
            <input type="text" value={form.sipProxy} onChange={(e) => update('sipProxy', e.target.value)} className="input-field text-sm font-mono" placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Transport</label>
              <select value={form.transport} onChange={(e) => update('transport', e.target.value)} className="input-field text-sm">
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
                <option value="tls">TLS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">SIP Server Port</label>
              <input type="number" value={form.localPort} onChange={(e) => update('localPort', parseInt(e.target.value) || 5060)} className="input-field text-sm font-mono" placeholder="5060" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Register Expiry (seconds)</label>
            <input type="number" value={form.registerExpiry} onChange={(e) => update('registerExpiry', parseInt(e.target.value) || 300)} className="input-field text-sm font-mono" />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
            <button onClick={() => onSave(form)} className="btn-primary flex-1 text-sm">Save</button>
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
      ? (settings.ringtonePath ? settings.ringtonePath.split(/[/\\]/).pop() : 'Custom file')
      : tones.find((t) => t.id === preset)?.name || 'Classic Beep'

  const stopPreview = () => {
    if (previewRef.current) {
      previewRef.current.pause()
      previewRef.current = null
    }
  }

  const handleSelect = async (id: string) => {
    stopPreview()
    if (id.startsWith('custom:')) {
      const tone = tones.find((t) => t.id === id)
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
    setPreviewMsg(`Imported ${result.name}`)
    setTimeout(() => setPreviewMsg(''), 2500)
  }

  const handlePreview = async () => {
    stopPreview()
    const volume = settings.ringtoneVolume ?? 0.7
    if (preset === 'classic') {
      // Short classic preview via Web Audio
      try {
        const ctx = new AudioContext()
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
        setPreviewMsg('Playing classic beep…')
      } catch {
        setPreviewMsg('Preview failed')
      }
      setTimeout(() => setPreviewMsg(''), 1500)
      return
    }

    const path = await window.api.ringtone.resolve(preset, settings.ringtonePath || '')
    if (!path) {
      setPreviewMsg('No ringtone file')
      setTimeout(() => setPreviewMsg(''), 2000)
      return
    }
    const data = await window.api.ringtone.readDataUrl(path)
    if (!data.success || !data.dataUrl) {
      setPreviewMsg(data.error || 'Could not load ringtone')
      setTimeout(() => setPreviewMsg(''), 2000)
      return
    }
    const audio = new Audio(data.dataUrl)
    audio.volume = Math.max(0, Math.min(1, volume))
    previewRef.current = audio
    audio.onended = () => setPreviewMsg('')
    try {
      await audio.play()
      setPreviewMsg('Playing…')
    } catch {
      setPreviewMsg('Preview failed')
      setTimeout(() => setPreviewMsg(''), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Devices">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Input Device (Microphone)</label>
            <select value={settings.inputDevice} onChange={(e) => onUpdate('inputDevice', e.target.value)} className="input-field text-sm">
              <option value="">System Default</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Output Device (Speaker)</label>
            <select value={settings.outputDevice} onChange={(e) => onUpdate('outputDevice', e.target.value)} className="input-field text-sm">
              <option value="">System Default</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Volume">
        <Slider label="Microphone" value={settings.micVolume} onChange={(v) => onUpdate('micVolume', v)} />
        <Slider label="Speaker" value={settings.speakerVolume} onChange={(v) => onUpdate('speakerVolume', v)} />
        <Slider label="Ringtone" value={settings.ringtoneVolume} onChange={(v) => onUpdate('ringtoneVolume', v)} />
      </Section>

      <Section title="Ringtone">
        <p className="text-[11px] text-text-muted mb-3">
          Choose a built-in tone or upload MP3 / WAV / OGG / M4A.
        </p>
        <div className="space-y-2 mb-3">
          {tones.filter((t) => t.builtin).map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                preset === t.id ? 'border-accent bg-accent/10' : 'border-border hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                name="ringtone"
                checked={preset === t.id}
                onChange={() => handleSelect(t.id)}
                className="accent-accent"
              />
              <span className="text-sm text-text">{t.name}</span>
              <span className="text-[10px] text-text-muted ml-auto">Built-in</span>
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
              onChange={() => handleSelect(tones.find((t) => !t.builtin)?.id || 'custom')}
              className="accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text">Custom file</div>
              <div className="text-[11px] text-text-muted truncate">{selectedLabel}</div>
            </div>
          </label>
          {tones.filter((t) => !t.builtin).map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ml-4 ${
                preset === 'custom' && settings.ringtonePath === t.path
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                name="ringtone-custom"
                checked={preset === 'custom' && settings.ringtonePath === t.path}
                onChange={() => handleSelect(t.id)}
                className="accent-accent"
              />
              <span className="text-sm text-text truncate">{t.name}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleUpload} className="btn-primary text-xs py-1.5 px-3">
            Upload…
          </button>
          <button type="button" onClick={handlePreview} className="btn-ghost text-xs py-1.5 px-3">
            Preview
          </button>
          <button type="button" onClick={stopPreview} className="btn-ghost text-xs py-1.5 px-3">
            Stop
          </button>
        </div>
        {previewMsg && <p className="text-[11px] text-text-muted mt-2">{previewMsg}</p>}
      </Section>
    </div>
  )
}

// ============================================================
// Advanced Tab
// ============================================================

function AdvancedTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Behavior">
        <Toggle label="Enable DND (Do Not Disturb)" checked={settings.dndEnabled} onChange={(v) => onUpdate('dndEnabled', v)} />
        <Toggle label="Auto Answer" checked={settings.autoAnswer} onChange={(v) => onUpdate('autoAnswer', v)} />
        <Toggle label="Minimize to Tray" checked={settings.minimizeToTray} onChange={(v) => onUpdate('minimizeToTray', v)} />
        <Toggle label="Enable SIP Debug Logging" checked={settings.enableLogging} onChange={(v) => onUpdate('enableLogging', v)} />
        <p className="text-[11px] text-text-muted -mt-2">
          When enabled, the Debug tab shows REGISTER / INVITE traffic, and logs are also appended to a daily file (Open folder from Debug).
        </p>
      </Section>

      <Section title="Call Forwarding">
        <Toggle label="Enable Call Forwarding" checked={settings.callForwardEnabled} onChange={(v) => onUpdate('callForwardEnabled', v)} />
        {settings.callForwardEnabled && (
          <div className="mt-3">
            <input type="text" value={settings.callForwardNumber} onChange={(e) => onUpdate('callForwardNumber', e.target.value)} className="input-field text-sm font-mono" placeholder="Forward to number" />
          </div>
        )}
      </Section>
    </div>
  )
}

// ============================================================
// API Tab
// ============================================================

function ApiTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (key: string, value: unknown) => void }) {
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

  const updateApi = (key: string, value: unknown) => {
    onUpdate('apiIntegration', { ...api, [key]: value })
  }

  const updateEvent = (key: string, value: boolean) => {
    updateApi('events', { ...api.events, [key]: value })
  }

  const updateScreenPop = (patch: Partial<ScreenPopSettings>) => {
    onUpdate('screenPop', { ...screenPop, ...patch })
  }

  const updateParam = (index: number, patch: Partial<ScreenPopParam>) => {
    const params = screenPop.params.map((p, i) => (i === index ? { ...p, ...patch } : p))
    updateScreenPop({ params })
  }

  const addParam = () => {
    updateScreenPop({
      params: [...screenPop.params, { name: '', source: 'caller_id' }],
    })
  }

  const removeParam = (index: number) => {
    updateScreenPop({ params: screenPop.params.filter((_, i) => i !== index) })
  }

  const sourceOptions: { value: ScreenPopParamSource; label: string }[] = [
    { value: 'caller_id', label: 'Caller ID' },
    { value: 'caller_name', label: 'Caller Name' },
    { value: 'extension', label: 'Extension' },
    { value: 'issabel_id', label: 'Issabel ID' },
    { value: 'call_id', label: 'Call ID' },
    { value: 'direction', label: 'Direction' },
    { value: 'answer_date', label: 'Answer Date' },
    { value: 'answer_time', label: 'Answer Time' },
    { value: 'answer_datetime', label: 'Answer DateTime' },
    { value: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-6">
      <Section title="Webhook Integration">
        <Toggle label="Enable API Integration" checked={api.enabled} onChange={(v) => updateApi('enabled', v)} />
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Webhook URL</label>
            <input type="url" value={api.webhookUrl} onChange={(e) => updateApi('webhookUrl', e.target.value)} className="input-field text-sm font-mono" placeholder="https://api.example.com/webhook" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">API Key (Bearer Token)</label>
            <input type="password" value={api.apiKey} onChange={(e) => updateApi('apiKey', e.target.value)} className="input-field text-sm" placeholder="Optional" />
          </div>
        </div>
      </Section>

      <Section title="Events">
        <Toggle label="Incoming Call" checked={api.events.incomingCall} onChange={(v) => updateEvent('incomingCall', v)} />
        <Toggle label="Call Answered" checked={api.events.callAnswered} onChange={(v) => updateEvent('callAnswered', v)} />
        <Toggle label="Call Ended" checked={api.events.callEnded} onChange={(v) => updateEvent('callEnded', v)} />
        <Toggle label="Call Missed" checked={api.events.callMissed} onChange={(v) => updateEvent('callMissed', v)} />
      </Section>

      <Section title="Auto-fill Fields">
        <p className="text-xs text-text-muted mb-3">Fields included in webhook payload for incoming calls</p>
        {api.autoFillFields.map((field, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input type="text" value={field.label} readOnly className="input-field text-xs flex-1" />
            <select value={field.source} className="input-field text-xs w-32">
              <option value="caller_id">Caller ID</option>
              <option value="extension">Extension</option>
              <option value="timestamp">Timestamp</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        ))}
      </Section>

      <Section title="Screen Pop">
        <p className="text-xs text-text-muted mb-3">
          Opens a URL in your default browser when a call is answered. Configure GET params below.
          Issabel ID is read from the SIP header you name — Issabel must send it via dialplan, e.g.{' '}
          <span className="font-mono">Set(PJSIP_HEADER(add,X-UniqueID)=${'${CHANNEL(uniqueid)}'})</span>.
        </p>
        <Toggle label="Enable Screen Pop" checked={screenPop.enabled} onChange={(v) => updateScreenPop({ enabled: v })} />
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Base URL</label>
            <input
              type="url"
              value={screenPop.baseUrl}
              onChange={(e) => updateScreenPop({ baseUrl: e.target.value })}
              className="input-field text-sm font-mono"
              placeholder="https://crm.example.com/pop"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Issabel SIP Header</label>
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
              <label className="block text-xs text-text-secondary">GET Parameters</label>
              <button type="button" onClick={addParam} className="text-xs text-accent hover:underline">
                Add param
              </button>
            </div>
            {screenPop.params.map((param, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={param.name}
                  onChange={(e) => updateParam(i, { name: e.target.value })}
                  className="input-field text-xs flex-1 font-mono"
                  placeholder="param"
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
                    placeholder="Custom value"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeParam(i)}
                  className="text-xs text-text-muted hover:text-red-400 px-1"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-all duration-200 ${
          checked ? 'bg-accent' : 'bg-bg-surface-2'
        }`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`} />
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
