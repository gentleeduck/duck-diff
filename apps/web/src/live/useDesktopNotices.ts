import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useGitHub } from '../github/SignIn'
import { isReady } from '../github/store'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import { newNotices } from './notices'
import { watchTopic } from './topics'

const selectOn = (settings: Settings) => settings.desktopNotices

// Opt-in browser notifications, driven by the same pushed topics the pages use.
export function useDesktopNotices() {
  const { api } = useApp()
  const github = useGitHub()
  const on = useSettings(selectOn)
  const ready = isReady(github)
  const me = github.status?.user?.login ?? null
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!on || !ready || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    let alive = true
    const check = async () => {
      const [notifications, runs] = await Promise.all([
        api.github.notifications(false).catch(() => []),
        api.github.runs().catch(() => []),
      ])
      if (!alive) return
      const result = newNotices(seen.current, notifications, runs, me)
      seen.current = result.seen
      for (const notice of result.notices) new Notification(notice.title, { body: notice.body, tag: notice.key })
    }
    void check()
    const stops = [watchTopic('notifications', check), watchTopic('runs', check)]
    return () => {
      alive = false
      for (const stop of stops) stop()
    }
  }, [api, on, ready, me])
}
