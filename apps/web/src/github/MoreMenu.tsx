import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Ellipsis } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export interface MoreAction {
  label: string
  icon: ReactNode
  run(): void
  destructive?: boolean
}

// GitHub's "…" on a comment: what can be done with it, each closing the menu first.
export function MoreMenu({ label, actions }: { label: string; actions: (MoreAction | false | null)[] }) {
  const [open, setOpen] = useState(false)
  const shown = actions.filter((action): action is MoreAction => Boolean(action))
  if (!shown.length) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label}>
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-52 flex-col p-1">
        {shown.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant="ghost"
            className={`w-full justify-start ${action.destructive ? 'text-destructive' : ''}`}
            onClick={() => {
              setOpen(false)
              action.run()
            }}>
            {action.icon}
            {action.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
