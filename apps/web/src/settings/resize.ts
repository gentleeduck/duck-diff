import { FONT_MAX, FONT_MIN, type Settings } from '../state/settings'

const clamp = (size: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, size))

// Ctrl + and Ctrl - step the code and the interface together.
export function resize(prev: Settings, step: number): Settings {
  return { ...prev, fontSize: clamp(prev.fontSize + step), uiFontSize: clamp(prev.uiFontSize + step) }
}
