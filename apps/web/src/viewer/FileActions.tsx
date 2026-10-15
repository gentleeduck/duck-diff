import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, Circle, CircleCheck, Copy, History, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { IconTool } from '../app/IconTool'

// duck-ui draws an empty box in the border color, which vanishes on the header; a lighter edge keeps it visible.
export const VISIBLE_BOX = 'size-4 border-muted-foreground'

export function FileActions({
  path,
  onOpen,
  writes,
  viewed,
  onViewed,
  onHistory,
  note,
}: {
  path: string
  onOpen?: () => void
  writes?: ReactNode
  viewed: boolean
  onViewed(): void
  onHistory(): void
  note?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <span className="flex items-center gap-1">
      {note ? <span className="mr-2 text-muted-foreground">{note}</span> : null}
      {writes}
      {onOpen && (
        <IconTool label="Open in Neovim" onClick={onOpen}>
          <SquareArrowOutUpRight />
        </IconTool>
      )}
      <IconTool label="File history" onClick={onHistory}>
        <History />
      </IconTool>
      <IconTool label="Copy path" tip={copied ? 'Copied' : 'Copy path'} onClick={copy}>
        {copied ? <Check /> : <Copy />}
      </IconTool>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            role="checkbox"
            aria-checked={viewed}
            aria-label="Viewed"
            onClick={onViewed}
            className={viewed ? 'text-tn-green hover:text-tn-green' : undefined}>
            {viewed ? <CircleCheck /> : <Circle />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{viewed ? 'Viewed, click to unmark' : 'Mark as viewed'}</TooltipContent>
      </Tooltip>
    </span>
  )
}
