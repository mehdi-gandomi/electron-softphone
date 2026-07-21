import {
  createContext,
  useContext,
  useState,
  ReactNode,
  HTMLAttributes,
  ButtonHTMLAttributes,
} from 'react'

/**
 * shadcn/ui-compatible Tabs (dependency-free implementation).
 * API: <Tabs defaultValue> <TabsList> <TabsTrigger value> <TabsContent value>
 * RTL-friendly: direction is inherited from the document (dir="rtl").
 */

interface TabsContextValue {
  value: string
  setValue: (v: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used inside <Tabs>')
  return ctx
}

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  defaultValue: string
  value?: string
  onValueChange?: (v: string) => void
  children: ReactNode
}

export function Tabs({ defaultValue, value, onValueChange, children, ...props }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue)
  const current = value ?? internal
  const setValue = (v: string) => {
    setInternal(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div {...props}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 p-1 bg-bg-surface border border-border rounded-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({ value, className = '', children, ...props }: TabsTriggerProps) {
  const { value: current, setValue } = useTabs()
  const active = current === value
  return (
    <button
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => setValue(value)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-accent/15 text-accent shadow-sm'
          : 'text-text-secondary hover:text-text hover-overlay'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

export function TabsContent({ value, className = '', children, ...props }: TabsContentProps) {
  const { value: current } = useTabs()
  if (current !== value) return null
  return (
    <div role="tabpanel" className={className} {...props}>
      {children}
    </div>
  )
}
