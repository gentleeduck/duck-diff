import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { withoutHistory } from '../lib/history'

// Like a repo's home page on GitHub, the README is what opens first, whether the file tree is shown or not.
export function useReadmeFirst() {
  const { fileSelection, queries } = useApp()
  const tree = useQuery(queries.git.tree())
  useEffect(() => {
    const readme = tree.data?.find((path) => /^readme(\.md|\.txt)?$/i.test(path))
    if (readme && fileSelection.get() === null) withoutHistory(() => fileSelection.set(readme))
  }, [tree.data, fileSelection])
}
