import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useGitHub } from '../github/SignIn'
import { isReady } from '../github/store'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import { newNotices } from './notices'

const selectOn = (settings: Settings) => settings.desktopNotices

// Opt-in browser notifications, from the same queries the inbox and actions pages read.
export function useDesktopNotices() {
  const { queries } = useApp()
  const github = useGitHub()
  const on = useSettings(selectOn)
  const ready = isReady(github)
  const me = github.status?.user?.login ?? null
  const seen = useRef<Set<string> | null>(null)
  const enabled = on && ready && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  const notifications = useQuery({ ...queries.gh.notifications(false), enabled }).data
  const runs = useQuery({ ...queries.gh.runs(), enabled }).data

  useEffect(() => {
    if (!enabled || !notifications || !runs) return
    const result = newNotices(seen.current, notifications, runs, me)
    seen.current = result.seen
    for (const notice of result.notices) new Notification(notice.title, { body: notice.body, tag: notice.key })
  }, [enabled, notifications, runs, me])
}
