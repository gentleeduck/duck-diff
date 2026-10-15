import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'

// Only a server started from Neovim can open files there.
export function useCanOpen(): boolean {
  const { queries } = useApp()
  return useQuery(queries.git.repo()).data?.nvim ?? false
}
