import { Button, Kbd, Toaster, TooltipProvider } from '@duck-diff/ui'
import { lazy, Suspense, useState } from 'react'
import { CompareBar } from '../compare/CompareBar'
import { HelpDialog } from '../keyboard/HelpDialog'
import { useKeyboard } from '../keyboard/useKeyboard'
import type { Api } from '../lib/api'
import { useLiveRefresh } from '../live/useLiveRefresh'
import { Palette } from '../palette/Palette'
import { CommentsSheet } from '../review/CommentsSheet'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import { WritesProvider } from '../writes/WritesProvider'
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
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setPalette(true)}>
              Search <Kbd>Ctrl K</Kbd>
            </Button>
            <CommentsSheet />
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
        <WritesProvider>
          <Screen />
          <Toaster position="bottom-right" />
        </WritesProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
