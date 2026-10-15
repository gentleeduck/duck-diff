import { targetKey } from '@duck-diff/protocol'
import { highlighter } from '../diff/highlighter'
import type { Session } from '../state/session'

const SAVE_MS = 1000
const MAX_BYTES = 1_500_000

// Once the diff on screen is colored, its colors go to the server, which hands them back with the next page
// load of the same diff (server state.ts pageDiff), so that one paints colored in its first frame.
export function saveTokens(session: Session): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = ''
  const save = () => {
    const { status, target, items } = session.get()
    if (status !== 'ready' || !items.length) return
    const tokens = highlighter.saved(items.slice(0, 40).map((item) => `${item.fileDiff.cacheKey}:`))
    if (!Object.keys(tokens).length) return
    const body = JSON.stringify({ key: targetKey(target), tokens })
    if (body === last || body.length > MAX_BYTES) return
    last = body
    void fetch('/api/state/tokens', { method: 'PUT', body }).catch(() => {})
  }
  const stop = highlighter.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_MS)
  })
  return () => {
    stop()
    if (timer) clearTimeout(timer)
  }
}
