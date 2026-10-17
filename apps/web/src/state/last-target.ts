import { lastTargetKey, targetKey } from '@duck-diff/protocol'
import { saved } from '../lib/saved'
import type { Store } from '../lib/store'
import { DEFAULT_TARGET, type Place } from '../router/place'

// Keeps the comparison the page shows (the diff's from and to) as its repo's last one, which the server opens
// the next page on (server state.ts rememberedTarget). The working tree is the default and needs no keeping.
export function rememberTarget(
  repo: string,
  place: Store<Place>,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = saved,
): () => void {
  const key = lastTargetKey(repo)
  const keep = () => {
    const target = place.get().target
    const text = targetKey(target) === targetKey(DEFAULT_TARGET) ? null : JSON.stringify(target)
    try {
      if (storage?.getItem(key) === text) return
      if (text === null) storage?.removeItem(key)
      else storage?.setItem(key, text)
    } catch {}
  }
  keep()
  return place.subscribe(keep)
}
