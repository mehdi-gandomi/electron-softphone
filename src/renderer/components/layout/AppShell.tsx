import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'

interface AppShellProps {
  children: ReactNode
  page: string
  onNavigate: (page: string) => void
}

export function AppShell({ children, page, onNavigate }: AppShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Title Bar */}
      <div className="title-bar">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent" />
          <span className="text-sm font-semibold text-text">VoxPhone</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => window.api.window.toggleAlwaysOnTop()} className="title-bar-btn text-text-secondary" title="Always on top">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 12h5v8h10v-8h5L12 2z"/></svg>
          </button>
          <button onClick={() => window.api.window.minimize()} className="title-bar-btn text-text-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
          </button>
          <button onClick={() => window.api.window.close()} className="title-bar-btn text-text-secondary hover:text-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePage={page} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  )
}
