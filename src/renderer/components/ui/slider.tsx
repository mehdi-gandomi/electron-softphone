import { InputHTMLAttributes } from 'react'

/**
 * shadcn/ui-style Slider (dependency-free, themed native range input).
 * API mirrors shadcn: value: number[], onValueChange(number[]).
 */
interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className = '',
  ...props
}: SliderProps) {
  const v = value[0] ?? 0
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      dir="ltr"
      min={min}
      max={max}
      step={step}
      value={v}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      className={`ui-slider ${className}`}
      style={{
        background: `linear-gradient(to right, rgb(var(--c-accent)) ${pct}%, rgb(var(--c-bg-surface-3)) ${pct}%)`,
      }}
      {...props}
    />
  )
}
