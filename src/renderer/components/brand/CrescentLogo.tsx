/** Official Helal Ahmar logo */

import logoUrl from '../../assets/logo.png'

interface CrescentLogoProps {
  size?: number
  className?: string
  /** Kept for API compatibility — image always includes the ring */
  withRing?: boolean
}

export function CrescentLogo({ size = 36, className = '' }: CrescentLogoProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      draggable={false}
    />
  )
}
