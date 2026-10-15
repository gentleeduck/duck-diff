import type { DiffTarget } from '@duck-diff/protocol'
import { useCallback } from 'react'
import { useApp } from '../app/AppProvider'
import { go } from '../lib/history'
import { hrefOf } from '../router/place'
import { useSession } from './useSession'

const selectTarget = (state: { target: DiffTarget }) => state.target

// The comparison is a url param kept across views; the diff session follows it (AppProvider).
export function useTarget(): { target: DiffTarget; navigate(target: DiffTarget, replace?: boolean): void } {
  const { place, tabs, diffFile, diffTop } = useApp()
  const target = useSession(selectTarget)

  const navigate = useCallback(
    (next: DiffTarget, replace = false) => {
      // The tab being left keeps the file it was at; the one opened goes back to its own.
      tabs.rememberPath(diffTop.get() ?? diffFile.get())
      const before = tabs.get().active
      const tab = tabs.open(next)
      go(hrefOf({ ...place.get(), target: next }), replace)
      if (tab.id !== before && tab.path) diffFile.set(tab.path)
    },
    [place, tabs, diffFile, diffTop],
  )

  return { target, navigate }
}
