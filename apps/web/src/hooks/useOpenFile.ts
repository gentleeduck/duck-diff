import { useCallback } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { focusTerminal } from '../terminal/input'

// Opens a file at a line: the attached Neovim, else Neovim in a new terminal in the page, else a code editor.
export function useOpenFile(): (path: string, line?: number) => Promise<void> {
  const { api, terminalTabs, panel } = useApp()
  return useCallback(
    async (path, line = 1) => {
      try {
        const result = await api.open(path, line)
        if (result.how !== 'terminal' || !result.command) return
        const key = terminalTabs.run(result.command, true)
        panel.show(key)
        focusTerminal(key)
      } catch (error) {
        toast.error((error as Error).message)
      }
    },
    [api, terminalTabs, panel],
  )
}
