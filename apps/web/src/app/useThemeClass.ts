import { useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'

const selectThemeType = (state: { themeType: 'system' | 'light' | 'dark' }) => state.themeType

// Keeps the `dark` class on <html> in step with the setting and, in system mode, with the OS.
export function useThemeClass() {
  const themeType = useSettings(selectThemeType)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = themeType === 'dark' || (themeType === 'system' && (media?.matches ?? true))
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [themeType])
}
