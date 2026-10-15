import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { watchTopic } from '../live/topics'

// Reloads when the server pushes a change to any of the topics; the reads come from the page's cache, which
// the push has already marked stale. A slow timer reads again regardless, for when the event socket is down.
export function useLive(topics: string | readonly string[], refresh: () => unknown, fallbackMs = 300_000) {
  const { api } = useApp()
  const latest = useRef(refresh)
  latest.current = refresh
  const key = typeof topics === 'string' ? topics : topics.join(' ')
  useEffect(() => {
    const run = () => void latest.current()
    const stops = key
      .split(' ')
      .filter(Boolean)
      .map((topic) => watchTopic(topic, run))
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      for (const topic of key.split(' ').filter(Boolean)) api.invalidate(topic)
      run()
    }
    const timer = setInterval(tick, fallbackMs)
    return () => {
      for (const stop of stops) stop()
      clearInterval(timer)
    }
  }, [key, fallbackMs, api])
}
