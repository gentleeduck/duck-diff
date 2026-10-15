'use client'

import { cn } from '@gentleduck/libs/cn'
import * as HoverCardPrimitive from '@gentleduck/primitives/hover-card'
import * as React from 'react'

const HoverCard = HoverCardPrimitive.Root
const HoverCardTrigger = HoverCardPrimitive.Trigger

// Like popovers, hover cards point at their trigger.
const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, children, side = 'top', align = 'center', sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      data-slot="hover-card-content"
      className={cn(
        'z-50 w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-hidden',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}>
      {children}
      <HoverCardPrimitive.Arrow asChild width={14} height={7} className="fill-popover" overflow="visible">
        <g>
          <path
            d="M 0,0 C 6,0 13.5,10 15,10 C 16.5,10 24,0 30,0"
            fill="none"
            stroke="var(--popover-border-color)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M 0,-2 L 30,-2 L 30,0 C 24,0 16.5,10 15,10 C 13.5,10 6,0 0,0 Z" />
        </g>
      </HoverCardPrimitive.Arrow>
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardContent, HoverCardTrigger }
