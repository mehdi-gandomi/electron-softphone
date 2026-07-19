import { useSipStore } from '../../stores/sipStore'

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
}

const navItems = [
  { id: 'dialpad', label: 'Dialpad', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#7F5AF0' : '#A7A9BE'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="4" height="4" rx="1"/>
      <rect x="10" y="2" width="4" height="4" rx="1"/>
      <rect x="16" y="2" width="4" height="4" rx="1"/>
      <rect x="4" y="8" width="4" height="4" rx="1"/>
      <rect x="10" y="8" width="4" height="4" rx="1"/>
      <rect x="16" y="8" width="4" height="4" rx="1"/>
      <rect x="4" y="14" width="4" height="4" rx="1"/>
      <rect x="10" y="14" width="4" height="4" rx="1"/>
      <rect x="16" y="14" width="4" height="4" rx="1"/>
      <rect x="4" y="20" width="16" height="3" rx="1"/>
    </svg>
  )},
  { id: 'contacts', label: 'Contacts', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#7F5AF0' : '#A7A9BE'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )},
  { id: 'history', label: 'Calls', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#7F5AF0' : '#A7A9BE'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )},
  { id: 'settings', label: 'Settings', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#7F5AF0' : '#A7A9BE'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )},
  { id: 'autofill', label: 'Form', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#7F5AF0' : '#A7A9BE'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )},
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const sipStatus = useSipStore((s) => s.status)

  const statusColor =
    sipStatus === 'registered' ? 'bg-success' :
    sipStatus === 'connecting' ? 'bg-warning' :
    sipStatus === 'failed' ? 'bg-error' :
    'bg-text-muted'

  return (
    <aside className="w-16 flex flex-col items-center py-3 bg-bg-surface border-r border-border gap-1">
      {navItems.map((item) => {
        const isActive = activePage === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 ${
              isActive
                ? 'bg-accent/10 shadow-[0_0_12px_rgba(127,90,240,0.15)]'
                : 'hover:bg-white/5'
            }`}
            title={item.label}
          >
            {item.icon(isActive)}
          </button>
        )
      })}

      <div className="flex-1" />

      {/* Registration status indicator */}
      <div className="flex flex-col items-center gap-2 pb-2">
        <div className="relative">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
          {sipStatus === 'registered' && (
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-success animate-ping opacity-50" />
          )}
        </div>
        <span className="text-[10px] text-text-muted">
          {sipStatus === 'registered' ? 'Online' : sipStatus === 'connecting' ? '...' : 'Offline'}
        </span>
      </div>
    </aside>
  )
}
