'use client'

import { cn } from '@gentleduck/libs/cn'
import { Slot } from '@gentleduck/primitives/slot'
import type { Variants } from '@gentleduck/variants'
import * as React from 'react'
import { labelled } from '../_internal/label'
import { badgeVariants } from './badge.constants'

const Badge = React.forwardRef<
  HTMLDivElement,
  Omit<React.HTMLProps<HTMLDivElement>, 'size'> & Variants.VariantProps<typeof badgeVariants> & { asChild?: boolean }
>(
  (
    { className, variant = 'default', size = 'default', border = 'default', asChild = false, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'span'

    return (
      <Comp ref={ref} className={cn(badgeVariants({ border, size, variant }), className)} data-slot="badge" {...props}>
        {asChild ? children : labelled(children)}
      </Comp>
    )
  },
)
Badge.displayName = 'Badge'

// The variants by name, for a map from what a badge says to how it looks.
type BadgeTone = NonNullable<Variants.VariantProps<typeof badgeVariants>['variant']>

export { Badge, type BadgeTone }
