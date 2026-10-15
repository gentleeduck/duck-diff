import { type DiffTarget, targetKey } from '@duck-diff/protocol'
import { useCallback, useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { pushUrl, replaceUrl } from '../lib/history'
import { readTarget, writeTarget } from '../lib/target-url'
import { useSession } from './useSession'

const selectTarget = (state: { target: DiffTarget }) => state.target

export function useTarget(): { target: DiffTarget; navigate(target: DiffTarget, replace?: boolean): void } {
  const { session, tabs, diffFile, diffTop } = useApp()
  const target = useSession(selectTarget)

  useEffect(() => {
    // Only a different comparison reloads; stepping between views of the same one keeps the page as it was.
    const onPop = () => {
      const next = readTarget(window.location.search)
      tabs.open(next)
      if (targetKey(next) !== targetKey(session.get().target)) void session.load(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [session, tabs])

  const navigate = useCallback(
    (next: DiffTarget, replace = false) => {
      // The tab being left keeps the file it was at; the one opened goes back to its own.
      tabs.rememberPath(diffTop.get() ?? diffFile.get())
      const before = tabs.get().active
      const tab = tabs.open(next)
      const search = writeTarget(next, window.location.search)
      if (replace) replaceUrl(search)
      else pushUrl(search)
      void session.load(next)
      if (tab.id !== before && tab.path) diffFile.set(tab.path)
    },
    [session, tabs, diffFile, diffTop],
  )

  return { target, navigate }
}
