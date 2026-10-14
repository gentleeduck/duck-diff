import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { SessionState } from '../state/session'

export function useSession<S>(select: (state: SessionState) => S): S {
  return useStore(useApp().session, select)
}
