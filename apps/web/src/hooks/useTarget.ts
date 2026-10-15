import type { DiffTarget } from '@duck-diff/protocol'
import { useCallback, useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { pushUrl, replaceUrl } from '../lib/history'
import { readTarget, writeTarget } from '../lib/target-url'
import { useSession } from './useSession'

const selectTarget = (state: { target: DiffTarget }) => state.target

export function useTarget(): { target: DiffTarget; navigate(target: DiffTarget, replace?: boolean): void } {
  const { session } = useApp()
  const target = useSession(selectTarget)

  useEffect(() => {
    const onPop = () => void session.load(readTarget(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [session])

  const navigate = useCallback(
    (next: DiffTarget, replace = false) => {
      const search = writeTarget(next, window.location.search)
      if (replace) replaceUrl(search)
      else pushUrl(search)
      void session.load(next)
    },
    [session],
  )

  return { target, navigate }
}
