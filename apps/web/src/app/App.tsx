import { Button, Kbd, TooltipProvider } from '@duck-diff/ui'
import { lazy, Suspense, useState } from 'react'
import { CompareBar } from '../compare/CompareBar'
import { HelpDialog } from '../keyboard/HelpDialog'
import { useKeyboard } from '../keyboard/useKeyboard'
import type { Api } from '../lib/api'
import { useLiveRefresh } from '../live/useLiveRefresh'
import { Palette } from '../palette/Palette'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import { AppProvider } from './AppProvider'
import { Shell } from './Shell'
import { StatusBar } from './StatusBar'
import { useThemeClass } from './useThemeClass'

const Viewer = lazy(() => import('../viewer/Viewer'))

function Screen() {
  useThemeClass()
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  useKeyboard({ palette: () => setPalette(true), help: () => setHelp(true) })
  const live = useLiveRefresh()
  return (
    <>
      <Shell
        topBar={
          <>
            <CompareBar />
            <Button variant="ghost" size="sm" className="gap-2 text-[var(--dd-muted)]" onClick={() => setPalette(true)}>
              Search <Kbd>Ctrl K</Kbd>
            </Button>
            <SettingsPopover />
          </>
        }
        sidebar={<Sidebar />}
        viewer={
          <Suspense fallback={null}>
            <Viewer />
          </Suspense>
        }
        status={<StatusBar live={live} />}
      />
      <Palette open={palette} onOpenChange={setPalette} />
      <HelpDialog open={help} onOpenChange={setHelp} />
    </>
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
