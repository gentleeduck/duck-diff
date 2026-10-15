import { useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { readNumber, readView, writeNumber } from '../lib/view-url'

// Keeps ?number= in step with the open pull request or issue, both ways, like GitHub's own urls.
export function useItemUrl() {
  const { pullSelection, issueSelection, view } = useApp()
  useEffect(() => {
    const selectionFor = () => (view.get() === 'prs' ? pullSelection : view.get() === 'issues' ? issueSelection : null)
    const initial = readNumber(window.location.search)
    if (initial !== null) selectionFor()?.set(initial)

    const push = (number: number | null) => {
      if (readNumber(window.location.search) === number) return
      window.history.pushState(null, '', writeNumber(number, window.location.search))
    }
    const stopPulls = pullSelection.subscribe(() => view.get() === 'prs' && push(pullSelection.get()))
    const stopIssues = issueSelection.subscribe(() => view.get() === 'issues' && push(issueSelection.get()))
    // Switching views leaves the number to the view that owns it.
    const stopView = view.subscribe(() => {
      const owner = selectionFor()
      const number = owner ? owner.get() : null
      window.history.replaceState(null, '', writeNumber(number, window.location.search))
    })
    const onPop = () => {
      const number = readNumber(window.location.search)
      const owner = readView(window.location.search) === 'prs' ? pullSelection : issueSelection
      if (owner.get() !== number) owner.set(number)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      stopPulls()
      stopIssues()
      stopView()
      window.removeEventListener('popstate', onPop)
    }
  }, [pullSelection, issueSelection, view])
}
