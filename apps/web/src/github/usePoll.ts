import { useEffect, useRef } from 'react'

// GitHub cannot push to a local page, so open pages ask again on a timer while visible and right away on focus.
// The server answers unchanged pages from GitHub's ETags, so this costs no rate limit when nothing moved.
export function usePoll(refresh: () => unknown, every: number) {
  const latest = useRef(refresh)
  latest.current = refresh
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void latest.current()
    }
    const timer = setInterval(tick, every)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [every])
}
