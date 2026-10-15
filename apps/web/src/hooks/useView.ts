import { useCallback, useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { readView, type View, writeView } from '../lib/view-url'

const selectView = (view: View) => view

export function useView(): { view: View; show(view: View): void } {
  const { view: store } = useApp()
  const view = useStore(store, selectView)

  useEffect(() => {
    const onPop = () => store.set(readView(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [store])

  const show = useCallback(
    (next: View) => {
      if (store.get() === next) return
      window.history.pushState(null, '', writeView(next, window.location.search))
      store.set(next)
    },
    [store],
  )
  return { view, show }
}
