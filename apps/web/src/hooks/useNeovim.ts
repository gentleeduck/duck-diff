import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'

// Whether a Neovim is attached to this server, for what only it can do (pointing its tab at a worktree).
export function useNeovim(): boolean {
  const { queries } = useApp()
  return useQuery(queries.git.repo()).data?.nvim ?? false
}
