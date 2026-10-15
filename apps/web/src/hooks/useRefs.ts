import { useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { RefList } from '../state/refs'

export type { RefList }

const selectList = (list: RefList) => list

export function useRefs(): RefList {
  const { refs } = useApp()
  useEffect(() => refs.load(), [refs])
  return useStore(refs, selectList)
}
