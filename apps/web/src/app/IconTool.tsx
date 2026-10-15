import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import type { ReactNode } from 'react'

// The 28px ghost icon button used across the page, named by its tooltip.
export function IconTool({
  label,
  tip = label,
  onClick,
  disabled,
  children,
}: {
  label: string
  // What the tooltip says when it differs from the accessible name, like "Copied".
  tip?: ReactNode
  onClick(): void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
