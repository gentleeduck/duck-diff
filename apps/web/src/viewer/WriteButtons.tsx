import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Minus, Plus, Undo2 } from 'lucide-react'
import type { WriteKind } from './actions'

const LOOK: Record<WriteKind, { icon: typeof Plus; label: string }> = {
  stage: { icon: Plus, label: 'Stage' },
  unstage: { icon: Minus, label: 'Unstage' },
  discard: { icon: Undo2, label: 'Discard' },
}

export function WriteButtons({
  kinds,
  scope,
  onWrite,
}: {
  kinds: WriteKind[]
  scope: 'file' | 'change'
  onWrite(kind: WriteKind): void
}) {
  return kinds.map((kind) => {
    const { icon: Icon, label } = LOOK[kind]
    return (
      <Tooltip key={kind}>
        <TooltipTrigger asChild>
          <Button
            variant={scope === 'file' ? 'ghost' : 'outline'}
            size={scope === 'file' ? 'icon' : 'sm'}
            className={kind === 'discard' ? 'text-destructive hover:text-destructive' : undefined}
            aria-label={`${label} ${scope}`}
            onClick={(event) => {
              event.stopPropagation()
              onWrite(kind)
            }}>
            <Icon />
            {/* The file header is a row of icons; a change keeps its words beside the code. */}
            {scope === 'change' ? label : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`${label} ${scope}`}</TooltipContent>
      </Tooltip>
    )
  })
}
