import type { AppContextValue } from '../app/AppProvider'
import { keepStore } from '../lib/kept'

type Kept = Pick<
  AppContextValue,
  'panel' | 'changesFolders' | 'fileHistory' | 'graphQuery' | 'symbol' | 'blameFiles' | 'reviews'
>

// The page's own stores, as a reload keeps them (lib/kept.ts).
export function keepPage(app: Kept): void {
  keepStore(
    app.panel,
    'panel',
    ({ open, tab, job }) => ({ open, tab, job }),
    (kept, state) => ({ ...state, ...kept }),
  )
  keepStore(
    app.changesFolders,
    'changes-folders',
    (folders) => [...folders],
    (kept) => new Set(kept),
  )
  keepStore(
    app.fileHistory,
    'file-history',
    (path) => path,
    (kept) => kept,
  )
  keepStore(
    app.graphQuery,
    'graph-query',
    (query) => query,
    (kept) => kept,
  )
  keepStore(
    app.symbol,
    'symbol',
    (symbol) => symbol,
    (kept) => kept,
  )
  keepStore(
    app.blameFiles,
    'blame-files',
    (paths) => [...paths],
    (kept) => new Set(kept),
  )
  // The comment being written, with the comparison it is on so loading that comparison keeps it.
  keepStore(
    app.reviews,
    'review-draft',
    ({ target, draft }) => (target && draft ? { target, draft } : null),
    (kept, state) => (kept ? { ...state, target: kept.target, draft: kept.draft } : state),
  )
}
