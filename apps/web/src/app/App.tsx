import { TooltipProvider } from '@duck-diff/ui'
import { lazy, Suspense } from 'react'
import { CompareBar } from '../compare/CompareBar'
import type { Api } from '../lib/api'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import { AppProvider } from './AppProvider'
import { Shell } from './Shell'
import { useThemeClass } from './useThemeClass'

const Viewer = lazy(() => import('../viewer/Viewer'))

function Screen() {
  useThemeClass()
  return (
    <Shell
      topBar={
        <>
          <CompareBar />
          <SettingsPopover />
        </>
      }
      sidebar={<Sidebar />}
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
