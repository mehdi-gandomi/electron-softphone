import { ReactNode } from 'react'

/**
 * Phone device chrome filling the window (bezel + earpiece).
 * No outer “mat” padding — avoids a second frame around the phone.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="h-full w-full flex items-stretch justify-center"
      style={{ background: 'var(--frame-bezel)' }}
    >
      <div
        className="relative h-full w-full rounded-none p-[5px] border"
        style={{ background: 'var(--frame-bezel)', borderColor: 'var(--frame-edge)' }}
      >
        {/* Earpiece / speaker grill */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 pointer-events-none">
          <div className="w-14 h-[4px] rounded-full bg-black/35 shadow-inner" />
        </div>

        {/* Screen */}
        <div className="h-full w-full rounded-[12px] overflow-hidden bg-bg shadow-phone-screen flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}
