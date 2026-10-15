import type { AppContextValue } from '../app/AppProvider'
import { openFile } from '../files/open-file'
import type { SymbolTarget } from './symbol-at'

// One definition opens straight away; none or several open the symbol panel to choose from.
export async function goToDefinition(app: AppContextValue, target: SymbolTarget, onOpen: () => void): Promise<void> {
  if (!target.at) {
    app.symbol.set(target)
    return
  }
  const found = await app.api.lsp
    .definition({ ...target.at, ...(target.ref ? { ref: target.ref } : {}) })
    .catch(() => null)
  const only = found?.locations.length === 1 ? found.locations[0] : undefined
  if (!only) {
    app.symbol.set(target)
    return
  }
  openFile(app, only.path, { line: only.line, at: only.path === target.at.path ? target.ref : null })
  onOpen()
}
