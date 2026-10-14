import type { Commit, Ref } from '@duck-diff/protocol'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'

export interface RefList {
  refs: Ref[]
  commits: Commit[]
}

// Loaded once per page; the picker filters locally, so typing never waits on the server.
export function useRefs(): RefList {
  const { api } = useApp()
  const [list, setList] = useState<RefList>({ refs: [], commits: [] })
  useEffect(() => {
    let alive = true
    Promise.all([api.refs(), api.commits({ head: 'HEAD', limit: 50 }).catch(() => [])])
      .then(([refs, commits]) => alive && setList({ refs, commits }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [api])
  return list
}
