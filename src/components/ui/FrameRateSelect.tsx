import type { SelectHTMLAttributes } from 'react'

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: number
  onChange: (value: number) => void
}

export function FrameRateSelect({ value, onChange, ...props }: Props) {
  const rates = [24, 30, 60]
  if (typeof value === 'number' && !rates.includes(value)) rates.push(value)
  return <select {...props} value={value} onChange={e => onChange(Number(e.target.value))}>
    {rates.sort((a, b) => a - b).map(fps => <option key={fps} value={fps}>{fps} fps</option>)}
  </select>
}
