import { useCallback } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'

// Opens a file at a line in the attached Neovim, else in a code editor (VS Code first), else with the
// system's own app; the server starts it, and the page only says where the file went.
export function useOpenFile(): (path: string, line?: number) => Promise<void> {
  const { api } = useApp()
  return useCallback(
    async (path, line = 1) => {
      try {
        const result = await api.open(path, line)
        const where =
          result.how === 'nvim' ? 'Neovim' : result.how === 'system' ? 'its default app' : editorName(result.command)
        toast(`Opened ${path} in ${where}`)
      } catch (error) {
        toast.error((error as Error).message)
      }
    },
    [api],
  )
}

const NAMES: Record<string, string> = {
  code: 'VS Code',
  'code-insiders': 'VS Code Insiders',
  codium: 'VSCodium',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  zed: 'Zed',
  subl: 'Sublime Text',
}

function editorName(command: string | null | undefined): string {
  const name = command?.split('/').pop() ?? ''
  // The VS Code inside a macOS app is a path ending in the same `code`.
  return NAMES[name] ?? (name || 'your editor')
}
