import { useEffect, useRef } from 'react'
import { watchTopic } from '../live/topics'

// Reloads when the server pushes a change to any of the topics, and on focus. A slow timer stays as a
// fallback for when the event socket is down.
export function useLive(topics: string | readonly string[], refresh: () => unknown, fallbackMs = 300_000) {
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
      if (document.visibilityState === 'visible') run()
    }
    const timer = setInterval(tick, fallbackMs)
    window.addEventListener('focus', tick)
    return () => {
      for (const stop of stops) stop()
      clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [key, fallbackMs])
}
