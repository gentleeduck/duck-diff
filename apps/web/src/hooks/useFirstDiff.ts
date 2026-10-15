import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'

// True once the diff's first load has finished, so reads that can wait never compete with the first paint.
export function useFirstDiff(): boolean {
  const { session } = useApp()
  const done = () => session.get().status === 'ready' || session.get().status === 'error'
  const [settled, setSettled] = useState(done)
  useEffect(() => {
    if (settled) return
    return session.subscribe(() => {
      if (session.get().status === 'ready' || session.get().status === 'error') setSettled(true)
    })
  }, [session, settled])
  return settled
}
