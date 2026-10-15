import { useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { BASE_FONT, type Settings } from '../state/settings'

const selectUi = (state: Settings) => state.uiFontSize
const selectWeight = (state: Settings) => state.fontWeight
const selectItalic = (state: Settings) => state.italic

// Text, controls and spacing are all in rem, so the root size is the interface's one dial.
export function useSizes() {
  const ui = useSettings(selectUi)
  useEffect(() => {
    document.documentElement.style.fontSize = `${(ui / BASE_FONT) * 16}px`
  }, [ui])
  const weight = useSettings(selectWeight)
  const italic = useSettings(selectItalic)
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--dd-weight', String(weight))
    root.setProperty('--dd-style', italic ? 'italic' : 'normal')
  }, [weight, italic])
}

// Rows the virtual lists place in pixels, scaled with the interface so their text still fits.
export function useRowHeight(base: number): number {
  const ui = useSettings(selectUi)
  return Math.round((base * ui) / BASE_FONT)
}
