import { Activity, type ReactNode, useState } from 'react'

// A tab or page rendered the first time it shows and kept afterwards. Hidden, React's Activity keeps its DOM
// and state but stops its effects and store subscriptions, so it does no work until it shows again, and
// coming back to it is instant: no remount, no refetch.
export function KeepAlive({ active, children }: { active: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(active)
  if (active && !seen) setSeen(true)
  if (!seen && !active) return null
  return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>
}
