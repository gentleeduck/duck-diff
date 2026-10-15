import { useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { BASE_FONT, type Settings } from '../state/settings'

const selectUi = (state: Settings) => state.uiFontSize

// Text, controls and spacing are all in rem, so the root size is the interface's one dial.
export function useSizes() {
  const ui = useSettings(selectUi)
  useEffect(() => {
    document.documentElement.style.fontSize = `${(ui / BASE_FONT) * 16}px`
  }, [ui])
}

// Rows the virtual lists place in pixels, scaled with the interface so their text still fits.
export function useRowHeight(base: number): number {
  const ui = useSettings(selectUi)
  return Math.round((base * ui) / BASE_FONT)
}
