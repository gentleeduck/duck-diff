import { cva } from '@gentleduck/variants'

export const toggleVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium text-sm ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: { size: 'default', variant: 'default' },
    variants: {
      size: {
        default: 'h-7 min-w-7 gap-1.5 px-2.5 has-[>svg]:px-2',
        lg: 'h-8 min-w-8 px-3 has-[>svg]:px-2.5',
        sm: 'h-7 min-w-7 gap-1.5 px-2.5 has-[>svg]:px-2',
      },
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
      },
    },
  },
)
