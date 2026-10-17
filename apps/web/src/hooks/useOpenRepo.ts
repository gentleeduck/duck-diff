import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'

// Another checkout gets its own server, and the server opens its page the way this one was opened (Neovim's
// plugin or an app window). Only when it cannot does the page open it: a tab, or this page where tabs are refused.
export function useOpenRepo(): (path: string) => Promise<boolean> {
  const { api } = useApp()
  return async (path) => {
    try {
      const { url, opened } = await api.openRepo(path)
      if (!opened && !window.open(url, '_blank')) window.location.assign(url)
      return true
    } catch (error) {
      toast.error(`Could not open ${path}`, { description: (error as Error).message })
      return false
    }
  }
}
