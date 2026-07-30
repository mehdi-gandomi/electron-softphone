import { useI18n } from '../../lib/i18n'

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
}

const navItems = [
  {
    id: 'dialpad',
    labelKey: 'nav.dialpad',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="4" height="4" rx="1"/>
        <rect x="10" y="3" width="4" height="4" rx="1"/>
        <rect x="16" y="3" width="4" height="4" rx="1"/>
        <rect x="4" y="9" width="4" height="4" rx="1"/>
        <rect x="10" y="9" width="4" height="4" rx="1"/>
        <rect x="16" y="9" width="4" height="4" rx="1"/>
        <rect x="4" y="15" width="4" height="4" rx="1"/>
        <rect x="10" y="15" width="4" height="4" rx="1"/>
        <rect x="16" y="15" width="4" height="4" rx="1"/>
      </svg>
    ),
  },
  {
    id: 'contacts',
    labelKey: 'nav.contacts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: 'history',
    labelKey: 'nav.history',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
  {
    id: 'profile',
    labelKey: 'nav.profile',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside className="w-[4.25rem] flex flex-col items-center py-1 bg-bg-surface border-e border-border gap-0 flex-shrink-0">
      {navItems.map((item) => {
        const isActive = activePage === item.id
        const label = t(item.labelKey)
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-[3.85rem] py-1.5 flex flex-col items-center gap-0.5 rounded-lg transition-all duration-200 ${
              isActive
                ? 'bg-accent/15 text-accent'
                : 'hover-overlay text-text-muted'
            }`}
            title={label}
          >
            {item.icon}
            <span className={`text-[11px] font-medium leading-tight ${isActive ? 'text-accent' : 'text-text-muted'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </aside>
  )
}
