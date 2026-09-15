import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomStatusBar } from './BottomStatusBar'
import { WindowHeader } from './WindowHeader'

interface AppShellProps {
  children: ReactNode
  page: string
  onNavigate: (page: string) => void
  canChangeExtension?: boolean
  onOpenExtensionPicker?: () => void
  extensionPickerBlockedReason?: string | null
}

export function AppShell({
  children,
  page,
  onNavigate,
  canChangeExtension = false,
  onOpenExtensionPicker,
  extensionPickerBlockedReason = null,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-full bg-bg">
      <WindowHeader />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar activePage={page} onNavigate={onNavigate} />
        <main className={`flex-1 min-w-0 min-h-0 p-2 ${page === 'dialpad' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {children}
        </main>
      </div>

      <BottomStatusBar
        canChangeExtension={canChangeExtension}
        onOpenExtensionPicker={onOpenExtensionPicker}
        extensionPickerBlockedReason={extensionPickerBlockedReason}
      />
    </div>
  )
}
