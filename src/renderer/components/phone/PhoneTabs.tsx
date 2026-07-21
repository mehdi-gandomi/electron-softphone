import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { DialPad } from '../dialpad/DialPad'
import { CallHistory } from '../history/CallHistory'
import { useHistoryStore } from '../../stores/historyStore'

/**
 * Tabbed main phone view: «شماره‌گیر» (default) + «تماس‌های اخیر»
 * with a red badge for missed calls.
 */
export function PhoneTabs() {
  const missedCount = useHistoryStore(
    (s) => s.records.filter((r) => r.result === 'missed').length
  )

  return (
    <Tabs defaultValue="dialpad" className="h-full flex flex-col" dir="rtl">
      <TabsList className="mb-3 flex-shrink-0">
        <TabsTrigger value="dialpad">شماره‌گیر</TabsTrigger>
        <TabsTrigger value="recent">
          تماس‌های اخیر
          {missedCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-error text-white text-[10px] font-bold leading-none">
              {missedCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dialpad" className="flex-1 overflow-y-auto">
        <DialPad />
      </TabsContent>
      <TabsContent value="recent" className="flex-1 overflow-hidden">
        <CallHistory />
      </TabsContent>
    </Tabs>
  )
}
