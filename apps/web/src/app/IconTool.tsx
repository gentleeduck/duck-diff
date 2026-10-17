import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import type { ReactNode } from 'react'

// What gives a destructive action away (discard, delete, remove, forget): red on hover, as GitHub marks them.
export const DANGER = 'hover:bg-destructive/15 hover:text-destructive focus-visible:text-destructive'

// The 28px ghost icon button used across the page, named by its tooltip.
export function IconTool({
  label,
  tip = label,
  onClick,
  disabled,
  destructive = false,
  className,
  children,
}: {
  label: string
  // What the tooltip says when it differs from the accessible name, like "Copied".
  tip?: ReactNode
  onClick(): void
  disabled?: boolean
  destructive?: boolean
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          className={[destructive ? DANGER : '', className ?? ''].join(' ').trim() || undefined}
          onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
