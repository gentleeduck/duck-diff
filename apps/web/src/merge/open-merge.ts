import type { Store } from '../lib/store'
import type { View } from '../router/place'

export function openMerge(
  stores: { mergeFile: Store<string | null> },
  show: (view: View) => void,
  path: string | null,
) {
  stores.mergeFile.set(path)
  show('merge')
}
