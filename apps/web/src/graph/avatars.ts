import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import type { Api } from '../lib/api'

const loaded = new WeakMap<Api, Promise<Record<string, string>>>()
const NOREPLY = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/

// GitHub's no-reply addresses carry the account id, so those avatars need no lookup at all.
export function avatarFor(map: Record<string, string>, email: string): string | null {
  const key = email.toLowerCase()
  const known = map[key]
  if (known) return known
  const id = NOREPLY.exec(key)?.[1]
  return id ? `https://avatars.githubusercontent.com/u/${id}` : null
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

// Read once per page; until it arrives, and for authors GitHub does not know, dots show initials.
export function useAvatars(): Record<string, string> {
  const { api } = useApp()
  const [map, setMap] = useState<Record<string, string>>({})
  useEffect(() => {
    let promise = loaded.get(api)
    if (!promise) {
      promise = api.github.avatars().catch(() => ({}))
      loaded.set(api, promise)
    }
    let alive = true
    void promise.then((next) => alive && setMap(next))
    return () => {
      alive = false
    }
  }, [api])
  return map
}
