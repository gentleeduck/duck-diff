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
  compact = false,
}: {
  kinds: WriteKind[]
  scope: 'file' | 'change'
  onWrite(kind: WriteKind): void
  compact?: boolean
}) {
  return kinds.map((kind) => {
    const { icon: Icon, label } = LOOK[kind]
    return (
      <Tooltip key={kind}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={compact ? 'size-5 rounded-sm' : 'size-6'}
            aria-label={`${label} ${scope}`}
            onClick={(event) => {
              event.stopPropagation()
              onWrite(kind)
            }}>
            <Icon className={compact ? 'size-3' : 'size-3.5'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`${label} ${scope}`}</TooltipContent>
      </Tooltip>
    )
  })
}
