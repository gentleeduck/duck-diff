import type { ChangedFile } from '@duck-diff/protocol'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { useFirstDiff } from '../hooks/useFirstDiff'

export interface StageState {
  staged: ChangedFile[]
  // Unstaged edits and new files, as the working tree has them.
  unstaged: ChangedFile[]
  loaded: boolean
}

const EMPTY: StageState = { staged: [], unstaged: [], loaded: false }

// Both sides of the index at once, whatever comparison the diff shows; read after the diff's first load.
export function useStage(): StageState {
  const { queries } = useApp()
  const { data } = useQuery({ ...queries.git.stage(), enabled: useFirstDiff() })
  return data ?? EMPTY
}
