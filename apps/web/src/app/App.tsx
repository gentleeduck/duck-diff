import type { Api } from '../lib/api'
import { AppProvider } from './AppProvider'
import { Shell } from './Shell'
import { useThemeClass } from './useThemeClass'

function Screen() {
  useThemeClass()
  return (
    <Shell
      topBar={<h1 className="font-[var(--dd-font-code)] text-[15px]">duck-diff</h1>}
      sidebar={null}
      viewer={null}
      status={null}
    />
  )
}

export function App({ api }: { api?: Api }) {
  return (
    <AppProvider api={api}>
      <Screen />
    </AppProvider>
  )
}
