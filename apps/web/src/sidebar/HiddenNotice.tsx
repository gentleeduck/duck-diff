import { Button } from '@duck-diff/ui'
import { EyeOff } from 'lucide-react'
import { useApp } from '../app/AppProvider'

// Said in place of an empty tree or diff when the Hide files patterns took every file, which otherwise
// looks like a comparison with no changes.
export function HiddenNotice({ count }: { count: number }) {
  const { settings } = useApp()
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-muted-foreground">
      <p>
        {count === 1 ? 'The one changed file is' : `All ${count} changed files are`} hidden by your Hide files patterns.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          settings.set((prev) => ({
            ...prev,
            hidePatterns: prev.hidePatterns.map((entry) => ({ ...entry, enabled: false })),
          }))
        }>
        <EyeOff />
        Turn the patterns off
      </Button>
    </div>
  )
}
