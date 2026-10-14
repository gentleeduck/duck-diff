import { Button, Checkbox, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, Copy, History, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
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
  const viewedId = useId()
  const copy = async () => {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <span className="flex items-center gap-1.5">
      {note ? <span className="mr-2 text-muted-foreground">{note}</span> : null}
      {writes}
      {onOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Open in Neovim" onClick={onOpen}>
              <SquareArrowOutUpRight />
              Open
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in Neovim</TooltipContent>
        </Tooltip>
      )}
      <IconTool label="File history" onClick={onHistory}>
        <History />
      </IconTool>
      <IconTool label="Copy path" tip={copied ? 'Copied' : 'Copy path'} onClick={copy}>
        {copied ? <Check /> : <Copy />}
      </IconTool>
      <label htmlFor={viewedId} className="ms-2 flex cursor-pointer items-center gap-1.5">
        <Checkbox id={viewedId} checked={viewed} onCheckedChange={onViewed} className={VISIBLE_BOX} />
        Viewed
      </label>
    </span>
  )
}
