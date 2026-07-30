import { ReactNode, type CSSProperties } from 'react'
import { Sun, Moon, Minus, X, Pin } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { BottomStatusBar } from './BottomStatusBar'
import { CrescentLogo } from '../brand/CrescentLogo'
import { useTheme } from '../../lib/theme'
import { useI18n } from '../../lib/i18n'

interface AppShellProps {
  children: ReactNode
  page: string
  onNavigate: (page: string) => void
}

export function AppShell({ children, page, onNavigate }: AppShellProps) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="title-bar !py-1.5 !px-2.5">
        <div className="flex items-center gap-2 min-w-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
          <CrescentLogo size={32} />
          <div className="min-w-0 text-start">
            <div className="text-[15px] font-bold text-text leading-tight tracking-tight">{t('shell.brand')}</div>
            <div className="text-[11px] text-text-muted truncate leading-tight">{t('shell.tagline')}</div>
          </div>
        </div>

        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button
            onClick={toggleTheme}
            className="title-bar-btn text-text-secondary"
            title={theme === 'dark' ? t('shell.themeLight') : t('shell.themeDark')}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button onClick={() => window.api.window.toggleAlwaysOnTop()} className="title-bar-btn text-text-secondary" title={t('shell.alwaysOnTop')}>
            <Pin size={12} />
          </button>
          <button onClick={() => window.api.window.minimize()} className="title-bar-btn text-text-secondary">
            <Minus size={13} />
          </button>
          <button onClick={() => window.api.window.close()} className="title-bar-btn text-text-secondary hover:text-error">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar activePage={page} onNavigate={onNavigate} />
        <main className={`flex-1 min-w-0 min-h-0 p-2 ${page === 'dialpad' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {children}
        </main>
      </div>

      <BottomStatusBar />
    </div>
  )
}
