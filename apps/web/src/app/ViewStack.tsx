import { Suspense } from 'react'
import type { View } from '../router/place'
import { MAINS } from '../router/router'
import { KeepAlive } from './KeepAlive'
import { ViewSkeleton } from './skeletons'

const ORDER = Object.keys(MAINS) as View[]

// Every view opened stays mounted behind the one showing, paused, so coming back keeps its scroll, its
// state and its data without drawing it again.
export function ViewStack({ view, item }: { view: View; item: boolean }) {
  return ORDER.map((each) => {
    const Main = MAINS[each]
    return (
      <KeepAlive key={each} active={each === view}>
        <div className="h-full">
          <Suspense fallback={<ViewSkeleton view={each} item={item} />}>
            <Main />
          </Suspense>
        </div>
      </KeepAlive>
    )
  })
}
