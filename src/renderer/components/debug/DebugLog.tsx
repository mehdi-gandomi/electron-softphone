import { useState, useEffect, useRef } from 'react'
import { useSipStore } from '../../stores/sipStore'
import { useI18n } from '../../lib/i18n'

interface LogEntry {
  timestamp: number
  direction: 'sent' | 'recv' | 'error' | 'info'
  message: string
  raw?: string
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions)
}

function directionIcon(dir: string) {
  switch (dir) {
    case 'sent': return '>>>'
    case 'recv': return '<<<'
    case 'error': return '!!!'
    case 'info': return '---'
    default: return '   '
  }
}

function logsToText(logs: LogEntry[]) {
  return logs.map((l) =>
    `[${formatTime(l.timestamp)}] ${directionIcon(l.direction)} ${l.message}${l.raw ? `\n${l.raw}` : ''}`
  ).join('\n\n')
}

export function DebugLog() {
  const { t } = useI18n()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState<'all' | 'sent' | 'recv' | 'error' | 'info'>('all')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [logFilePath, setLogFilePath] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const sipStatus = useSipStore((s) => s.status)
  const sipError = useSipStore((s) => s.errorMessage)

  const fetchLogs = async () => {
    try {
      const logData = await window.api.sip.getLog()
      setLogs(logData as LogEntry[])
    } catch {}
  }

  useEffect(() => {
    fetchLogs()
    window.api.debug.getLogFilePath().then((p) => setLogFilePath(p || '')).catch(() => {})
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 1000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    if (autoRefresh && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoRefresh])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.direction === filter)
  const errorCount = logs.filter((l) => l.direction === 'error').length

  const directionColor = (dir: string) => {
    switch (dir) {
      case 'sent': return 'text-accent'
      case 'recv': return 'text-success'
      case 'error': return 'text-error'
      case 'info': return 'text-warning'
      default: return 'text-text-muted'
    }
  }

  const handleReconnect = async () => {
    const result = await window.api.sip.reconnect()
    if (!result.success) {
      useSipStore.getState().setStatus('failed', 0, result.error || t('debug.reconnectFailed'))
    }
    fetchLogs()
  }

  const handleClear = async () => {
    await window.api.sip.clearLog()
    setLogs([])
    setSelectedLog(null)
  }

  const handleCopy = async () => {
    const text = logsToText(filter === 'all' ? logs : filtered)
    try {
      const ok = await window.api.clipboard.writeText(text)
      if (!ok) throw new Error('clipboard failed')
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 1500)
    } catch {
      setSaveMsg(t('debug.copyFailed'))
      setTimeout(() => setSaveMsg(''), 2000)
    }
  }

  const handleSave = async () => {
    const text = logsToText(filter === 'all' ? logs : filtered)
    const result = await window.api.debug.saveLog(text)
    if (result.success && result.path) {
      setSaveMsg(t('debug.saved', { path: result.path }))
    } else if (result.error && result.error !== 'Cancelled') {
      setSaveMsg(result.error)
    }
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const handleOpenFolder = async () => {
    await window.api.debug.openLogsFolder()
  }

  const filterLabels: Record<typeof filter, string> = {
    all: t('debug.filter.all'),
    sent: t('debug.filter.sent'),
    recv: t('debug.filter.recv'),
    error: t('debug.filter.error'),
    info: t('debug.filter.info'),
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-text">{t('debug.title')}</h1>
          <p className="text-[11px] text-text-muted mt-0.5">
            {t('debug.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={handleReconnect} className="btn-primary text-xs py-1 px-3">
            {t('debug.reconnect')}
          </button>
          <button onClick={handleCopy} className="btn-ghost text-xs py-1 px-3">
            {copyDone ? t('debug.copied') : t('debug.copy')}
          </button>
          <button onClick={handleSave} className="btn-ghost text-xs py-1 px-3">
            {t('debug.save')}
          </button>
          <button onClick={handleOpenFolder} className="btn-ghost text-xs py-1 px-3">
            {t('debug.openFolder')}
          </button>
          <button onClick={handleClear} className="btn-ghost text-xs py-1 px-3">
            {t('debug.clear')}
          </button>
          <button onClick={fetchLogs} className="btn-ghost text-xs py-1 px-3">
            {t('debug.refresh')}
          </button>
        </div>
      </div>

      {(saveMsg || logFilePath) && (
        <div className="mb-2 text-[11px] text-text-muted break-all">
          {saveMsg && <div className="text-success mb-1">{saveMsg}</div>}
          {logFilePath && (
            <div>
              {t('debug.autoLog')} <span className="text-text-secondary">{logFilePath}</span>
            </div>
          )}
        </div>
      )}

      <div className={`mb-3 px-3 py-2 rounded-xl border text-xs ${
        sipStatus === 'registered' ? 'bg-success/10 border-success/30 text-success' :
        sipStatus === 'connecting' ? 'bg-warning/10 border-warning/30 text-warning' :
        sipStatus === 'failed' ? 'bg-error/10 border-error/30 text-error' :
        'bg-bg-surface border-border text-text-secondary'
      }`}>
        <span className="font-medium">{t('debug.registration', { status: sipStatus })}</span>
        {sipError && <span className="ms-2 opacity-90">— {sipError}</span>}
        {errorCount > 0 && (
          <span className="ms-2 text-error font-medium">{t('debug.errorsInLog', { count: errorCount })}</span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-1 p-1 bg-bg-surface rounded-lg">
          {(['all', 'sent', 'recv', 'error', 'info'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                filter === f ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text'
              }`}
            >
              {filterLabels[f]}
              {f === 'error' && errorCount > 0 ? ` (${errorCount})` : ''}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-accent"
          />
          {t('debug.autoRefresh')}
        </label>
        <span className="text-[10px] text-text-muted ms-auto">{t('debug.entries', { count: logs.length })}</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-bg rounded-xl border border-border p-2 font-mono text-[11px] leading-5 min-h-[200px]">
        {filtered.length === 0 ? (
          <div className="text-text-muted text-center py-8">
            {logs.length === 0
              ? t('debug.empty')
              : t('debug.noMatch')}
          </div>
        ) : (
          <>
            {filtered.map((log, i) => (
              <div
                key={i}
                onClick={() => setSelectedLog(selectedLog === log ? null : log)}
                className={`flex gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors ${
                  selectedLog === log ? 'bg-accent/10' : ''
                } ${log.direction === 'error' ? 'bg-error/5' : ''}`}
              >
                <span className="text-text-muted flex-shrink-0">{formatTime(log.timestamp)}</span>
                <span className={`${directionColor(log.direction)} flex-shrink-0 w-5 text-center font-bold`}>
                  {directionIcon(log.direction)}
                </span>
                <span className="text-text break-all">{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </>
        )}
      </div>

      {selectedLog && selectedLog.raw && (
        <div className="mt-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-accent hover:text-accent-hover mb-2"
          >
            {showRaw ? t('debug.hideRaw') : t('debug.showRaw')}
          </button>
          {showRaw && (
            <pre className="bg-bg p-3 rounded-xl border border-border overflow-x-auto text-[10px] text-text-secondary leading-4 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
              {selectedLog.raw}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
