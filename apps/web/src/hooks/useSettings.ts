import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { Settings } from '../state/settings'

export function useSettings<S>(select: (state: Settings) => S): S {
  return useStore(useApp().settings, select)
}
