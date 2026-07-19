import { useState } from 'react'
import { useHistoryStore } from '../../stores/historyStore'
import { formatDate, formatDuration } from '../../lib/utils'
import type { CallRecord } from '../../../shared/types'

type Filter = 'all' | 'missed' | 'dialed' | 'received'

export function CallHistory() {
  const { records, getFiltered, clearAll } = useHistoryStore()
  const [filter, setFilter] = useState<Filter>('all')
  const filtered = getFiltered(filter)

  const handleCall = (number: string) => {
    window.api.sip.makeCall(number)
  }

  const resultIcon = (result: string) => {
    switch (result) {
      case 'missed':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E53170" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      case 'answered':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2CB67D" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/></svg>
      case 'rejected':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF8906" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      default:
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A7A9BE" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/></svg>
    }
  }

  const directionIcon = (dir: string) =>
    dir === 'outbound' ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
    )

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: records.length },
    { id: 'missed', label: 'Missed', count: records.filter(r => r.result === 'missed').length },
    { id: 'dialed', label: 'Dialed', count: records.filter(r => r.direction === 'outbound').length },
    { id: 'received', label: 'Received', count: records.filter(r => r.direction === 'inbound' && r.result === 'answered').length },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text">Call History</h1>
        {records.length > 0 && (
          <button onClick={clearAll} className="text-xs text-text-muted hover:text-error transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-bg-surface rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              filter === tab.id
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
            </svg>
            <p className="text-sm">No calls yet</p>
          </div>
        ) : (
          filtered.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-bg-surface border border-transparent hover:border-border transition-all duration-150 group cursor-pointer"
              onClick={() => handleCall(record.number)}
            >
              <div className="flex-shrink-0">
                {resultIcon(record.result)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text truncate">{record.name || record.number}</span>
                  <span className="text-text-muted">{directionIcon(record.direction)}</span>
                </div>
                <p className="text-xs text-text-secondary font-mono truncate">{record.number}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-text-muted">{formatDate(record.timestamp)}</p>
                {record.duration > 0 && (
                  <p className="text-[10px] text-text-muted">{formatDuration(record.duration)}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
