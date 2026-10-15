import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'

// Only a server started from Neovim can open files there.
export function useCanOpen(): boolean {
  const { api } = useApp()
  const [canOpen, setCanOpen] = useState(false)
  useEffect(() => {
    api.repo().then(
      (info) => setCanOpen(info.nvim),
      () => {},
    )
  }, [api])
  return canOpen
}
