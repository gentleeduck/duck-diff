import type { ChangedFile } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import type { Session } from './session'

export interface StageState {
  staged: ChangedFile[]
  // Unstaged edits and new files, as the working tree has them.
  unstaged: ChangedFile[]
  loaded: boolean
}

export interface Stage extends Store<StageState> {
  // Starts following the repo; safe to call from every mount.
  load(): void
  reload(): Promise<void>
}

// Both sides of the index at once, whatever comparison the diff shows. It rereads whenever the diff
// finishes loading, which every change (from the page or the terminal) already triggers.
export function createStage(api: Api, session: Session): Stage {
  const store = createStore<StageState>({ staged: [], unstaged: [], loaded: false })
  let started = false
  let latest = 0

  const reload = async () => {
    const request = ++latest
    try {
      const [staged, unstaged] = await Promise.all([api.files({ kind: 'staged' }), api.files({ kind: 'unstaged' })])
      if (request === latest) store.set({ staged, unstaged, loaded: true })
    } catch {
      // Kept as it was; the next change tries again.
    }
  }

  return {
    ...store,
    reload,
    load() {
      if (started) return
      started = true
      const settled = () => session.get().status === 'ready' || session.get().status === 'error'
      if (settled()) void reload()
      session.subscribe(() => {
        if (settled()) void reload()
      })
    },
  }
}
