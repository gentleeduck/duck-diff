import { useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { isPopping, pushUrl, replaceUrl } from '../lib/history'
import type { Store } from '../lib/store'
import { PULL_TABS, type PullTab, readView, type View } from '../lib/view-url'

interface Param<T> {
  name: string
  views: readonly View[]
  store: Store<T>
  read(raw: string | null): T
  write(value: T): string | null
}

const number = (raw: string | null) => {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}
const text = (raw: string | null) => raw || null
const same = <T>(value: T) => (value === null ? null : String(value))

// Everything a page shows lives in the url, so back and forward step through it like a browser.
export function useUrlSync() {
  const { view, pullSelection, issueSelection, fileSelection, graphSelection, pullTab, diffFile } = useApp()
  useEffect(() => {
    const params: Param<unknown>[] = [
      { name: 'number', views: ['prs'], store: pullSelection, read: number, write: same },
      { name: 'number', views: ['issues'], store: issueSelection, read: number, write: same },
      // Read after the number: opening a pull request starts on its conversation unless the url says otherwise.
      {
        name: 'tab',
        views: ['prs'],
        store: pullTab,
        read: (raw) => (PULL_TABS.find((tab) => tab === raw) ?? 'conversation') as PullTab,
        write: (tab) => (tab === 'conversation' ? null : String(tab)),
      },
      { name: 'file', views: ['files'], store: fileSelection, read: text, write: same },
      { name: 'commit', views: ['graph'], store: graphSelection, read: text, write: same },
      { name: 'path', views: ['changes', 'prs'], store: diffFile, read: text, write: same },
    ] as Param<unknown>[]

    const owned = (current: View) => params.filter((param) => param.views.includes(current))
    // The url as the stores say it should read for the current view; params of other views are dropped.
    const urlFor = (current: View) => {
      const search = new URLSearchParams(window.location.search)
      for (const param of params) if (!owned(current).some((own) => own.name === param.name)) search.delete(param.name)
      for (const param of owned(current)) {
        const value = param.write(param.store.get())
        if (value === null) search.delete(param.name)
        else search.set(param.name, value)
      }
      const query = search.toString()
      return query ? `?${query}` : '?'
    }

    let applying = false
    const apply = () => {
      applying = true
      const search = new URLSearchParams(window.location.search)
      for (const param of owned(readView(window.location.search))) {
        const next = param.read(search.get(param.name))
        if (param.store.get() !== next) param.store.set(next)
      }
      applying = false
    }
    apply()

    const stops = params.map((param) =>
      param.store.subscribe(() => {
        if (applying || isPopping() || !param.views.includes(view.get())) return
        pushUrl(urlFor(view.get()))
      }),
    )
    // A new pull request opens on its conversation, as it does on GitHub.
    stops.push(
      pullSelection.subscribe(() => !applying && pullTab.get() !== 'conversation' && pullTab.set('conversation')),
    )
    // The view push happens first (useView); the params follow it into the same history entry.
    stops.push(view.subscribe(() => !applying && !isPopping() && replaceUrl(urlFor(view.get()))))
    window.addEventListener('popstate', apply)
    return () => {
      for (const stop of stops) stop()
      window.removeEventListener('popstate', apply)
    }
  }, [view, pullSelection, issueSelection, fileSelection, graphSelection, pullTab, diffFile])
}
