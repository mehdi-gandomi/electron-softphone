import { ReactNode } from 'react'

/**
 * "Real phone" device frame: charcoal/matte bezel, heavy rounded corners,
 * inner screen shadow, drop shadow — over a calm gradient backdrop.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="h-full w-full flex items-center justify-center p-3"
      style={{ background: 'var(--frame-outer-bg)' }}
    >
      <div
        className="relative h-full w-full max-w-lg rounded-3xl p-[7px] shadow-phone border"
        style={{ background: 'var(--frame-bezel)', borderColor: 'var(--frame-edge)' }}
      >
        {/* Earpiece slot */}
        <div className="absolute top-[3px] left-1/2 -translate-x-1/2 w-14 h-[3px] rounded-full bg-black/25" />
        {/* Screen */}
        <div className="h-full w-full rounded-[18px] overflow-hidden bg-bg shadow-phone-screen flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}
