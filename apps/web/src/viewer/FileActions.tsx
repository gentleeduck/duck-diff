import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, Copy, SquareArrowOutUpRight } from 'lucide-react'
import { useState } from 'react'

export function FileActions({ path, onOpen }: { path: string; onOpen?: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <span className="flex items-center gap-0.5">
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
          <Button variant="ghost" size="icon" className="size-6" aria-label="Copy path" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : 'Copy path'}</TooltipContent>
      </Tooltip>
    </span>
  )
}
