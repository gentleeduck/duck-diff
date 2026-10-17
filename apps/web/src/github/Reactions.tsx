import { REACTIONS, type Reaction } from '@duck-diff/protocol'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { SmilePlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'

export const EMOJI: Record<Reaction, string> = {
  '+1': '👍',
  '-1': '👎',
  laugh: '😄',
  hooray: '🎉',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀',
}

// Counts as GitHub shows them; clicking one adds yours or takes it back.
export function Reactions({
  target,
  counts,
  onChanged,
}: {
  target: { issue: number } | { comment: number }
  counts: Partial<Record<Reaction, number>>
  onChanged(): void
}) {
  const { api } = useApp()
  const [open, setOpen] = useState(false)
  const toggle = async (content: Reaction) => {
    setOpen(false)
    try {
      await api.github.react(target, content)
      onChanged()
    } catch (error) {
      toast.error('Could not react', { description: (error as Error).message })
    }
  }
  const given = REACTIONS.filter((reaction) => counts[reaction])
  return (
    <div className="flex flex-wrap items-center gap-1">
      {given.map((reaction) => (
        <Button
          key={reaction}
          size="sm"
          variant="outline"
          aria-label={`${reaction} reaction, ${counts[reaction]}`}
          className="h-7 gap-1 px-2 not-italic"
          onClick={() => void toggle(reaction)}>
          <span aria-hidden>{EMOJI[reaction]}</span>
          <span className="tabular-nums">{counts[reaction]}</span>
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Add a reaction">
            <SmilePlus />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="flex w-auto gap-1 p-1">
          {REACTIONS.map((reaction) => (
            <Button
              key={reaction}
              size="icon"
              variant="ghost"
              aria-label={`React ${reaction}`}
              className="not-italic"
              onClick={() => void toggle(reaction)}>
              {EMOJI[reaction]}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
