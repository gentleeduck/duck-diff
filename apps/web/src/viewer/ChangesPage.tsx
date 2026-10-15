import { targetKey } from '@duck-diff/protocol'
import { memo, useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { DiffTabs } from './DiffTabs'
import Viewer from './Viewer'

const Diff = memo(Viewer)

export default function ChangesPage() {
  const { place, session } = useApp()
  // A pull request's Files tab borrows the diff for its own comparison; coming back shows the url's again.
  useEffect(() => {
    const { target } = place.get()
    if (targetKey(target) !== targetKey(session.get().target)) void session.load(target)
  }, [place, session])
  return (
    <div className="flex h-full flex-col">
      <DiffTabs />
      <div className="min-h-0 flex-1">
        <Diff />
      </div>
    </div>
  )
}
