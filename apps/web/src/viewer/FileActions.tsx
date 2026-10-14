import { Button, Checkbox, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, Copy, History, SquareArrowOutUpRight } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'

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
    <span className="flex items-center gap-0.5">
      {note ? <span className="mr-2 text-[12px] text-[var(--dd-muted)]">{note}</span> : null}
      {writes}
      {onOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Open in Neovim" onClick={onOpen}>
              <SquareArrowOutUpRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in Neovim</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6" aria-label="File history" onClick={onHistory}>
            <History className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>File history</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Copy path" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : 'Copy path'}</TooltipContent>
      </Tooltip>
      <label
        htmlFor={viewedId}
        className="ml-2 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--dd-muted)]">
        <Checkbox id={viewedId} checked={viewed} onCheckedChange={onViewed} />
        Viewed
      </label>
    </span>
  )
}
