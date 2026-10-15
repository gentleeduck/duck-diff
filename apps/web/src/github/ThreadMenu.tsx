import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Ellipsis } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export interface ThreadAction {
  label: string
  icon: ReactNode
  run(): void
  destructive?: boolean
}

// The "..." beside a pull request's or issue's title, for the less common changes.
export function ThreadMenu({ actions }: { actions: ThreadAction[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" aria-label="More actions">
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-60 flex-col p-1">
        {actions.map((action) => (
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
