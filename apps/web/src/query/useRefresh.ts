import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { invalidateTopic } from './client'

// After a write: the reads following these topics are read again, on this page and every other.
export function useRefresh(): (...topics: string[]) => Promise<void> {
  const client = useQueryClient()
  return useCallback(
    async (...topics: string[]) => {
      await Promise.all(topics.map((topic) => invalidateTopic(client, topic)))
    },
    [client],
  )
}
