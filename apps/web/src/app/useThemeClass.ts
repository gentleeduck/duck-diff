import { useLayoutEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import { applyTheme } from './themes'

const selectTheme = (state: Settings) => state.theme

// Puts the chosen theme's colors on <html> before the page paints, so a reload never flashes another one.
export function useThemeClass() {
  const theme = useSettings(selectTheme)
  useLayoutEffect(() => applyTheme(theme), [theme])
}
