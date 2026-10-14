import { TooltipProvider } from '@duck-diff/ui'
import { lazy, Suspense } from 'react'
import type { Api } from '../lib/api'
import { ChangesTree } from '../sidebar/ChangesTree'
import { AppProvider } from './AppProvider'
import { Shell } from './Shell'
import { useThemeClass } from './useThemeClass'

const Viewer = lazy(() => import('../viewer/Viewer'))

function Screen() {
  useThemeClass()
  return (
    <Shell
      topBar={<h1 className="font-[var(--dd-font-code)] text-[15px]">duck-diff</h1>}
      sidebar={<ChangesTree />}
      viewer={
        <Suspense fallback={null}>
          <Viewer />
        </Suspense>
      }
      status={null}
    />
  )
}

export function App({ api }: { api?: Api }) {
  return (
    <AppProvider api={api}>
      <TooltipProvider>
        <Screen />
      </TooltipProvider>
    </AppProvider>
  )
}
