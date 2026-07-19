import { useSipStore } from '../../stores/sipStore'
import { useCallStore } from '../../stores/callStore'

export function StatusBar() {
  const sipStatus = useSipStore((s) => s.status)
  const errorMessage = useSipStore((s) => s.errorMessage)
  const calls = useCallStore((s) => s.calls)
  const activeCalls = Array.from(calls.values()).filter(
    (c) => c.state === 'active' || c.state === 'holding' || c.state === 'outgoing' || c.state === 'ringing'
  )

  const statusLabel =
    sipStatus === 'registered' ? 'Registered' :
    sipStatus === 'connecting' ? 'Connecting...' :
    sipStatus === 'failed' ? 'Failed' :
    'Offline'

  const statusColor =
    sipStatus === 'registered' ? 'text-success' :
    sipStatus === 'connecting' ? 'text-warning' :
    sipStatus === 'failed' ? 'text-error' :
    'text-text-muted'

  return (
    <div className="h-7 px-4 flex items-center justify-between text-[11px] bg-bg-surface border-t border-border gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`font-medium flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
        {errorMessage && sipStatus !== 'registered' && (
          <span className="text-error truncate" title={errorMessage}>
            — {errorMessage}
          </span>
        )}
        {activeCalls.length > 0 && (
          <span className="text-accent flex-shrink-0">
            {activeCalls.length} active call{activeCalls.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="text-text-muted flex-shrink-0">
        VoxPhone v1.0
      </div>
    </div>
  )
}
