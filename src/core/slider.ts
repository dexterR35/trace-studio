import { clamp } from './types'

// Symmetric logarithmic position controls retain fine movement around the base plane.
export function sliderValue(value: number, min: number, max: number, logarithmic: boolean) {
  if (!logarithmic) return clamp((value - min) / Math.max(.000001, max - min), 0, 1)
  if (min >= 0) return clamp(Math.log10(1 + (value - min) / Math.max(1, max - min) * 999) / 3, 0, 1)
  const extent = value < 0 ? Math.abs(min) : max, position = Math.log10(1 + Math.abs(value) / Math.max(1, extent) * 999) / 3
  return clamp(.5 + Math.sign(value) * position / 2, 0, 1)
}
export function sliderNumber(position: number, min: number, max: number, logarithmic: boolean, step: number) {
  const normalized = clamp(position, 0, 1), signed = (normalized - .5) * 2
  const value = logarithmic ? min >= 0 ? min + (max - min) * (10 ** (normalized * 3) - 1) / 999 : Math.sign(signed) * (signed < 0 ? Math.abs(min) : max) * (10 ** (Math.abs(signed) * 3) - 1) / 999 : min + normalized * (max - min)
  return clamp(Math.round(value / step) * step, min, max)
}
