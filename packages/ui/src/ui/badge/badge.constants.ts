import { cva } from '@gentleduck/variants'

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md ps-2 pe-2.5 py-0.5 font-medium transition-colors [&_svg]-size-3 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    defaultVariants: { border: 'default', size: 'default', variant: 'default' },
    variants: {
      border: {
        default: '',
        destructive: 'border border-destructive/40 bg-destructive/40 hover:border-destructive hover:bg-destructive/65',
        primary: 'border border-border/40 hover:border-border/80',
        secondary: 'border border-secondary/40 bg-secondary/40 hover:border-secondary hover:bg-secondary/65',
        warning: 'border border-warning/40 bg-warning/40 hover:border-warning hover:bg-warning/65',
      },
      size: {
        // The page is set in italic, which leans right; a little more room at the end keeps the word centered.
        default: 'ps-2.5 pe-3 py-0.5 text-sm',
        icon: 'size-[1.6rem] items-center justify-center rounded-full p-0 [&_*]:size-[.9rem]',
        lg: 'ps-3.5 pe-4 py-0.9 text-lg',
        sm: 'h-6 gap-1 ps-1.5 pe-2 py-0 text-sm leading-none',
      },
      variant: {
        nothing: '!px-0 text-accent-foreground',
        dashed:
          'border border-input border-dashed bg-background text-accent-foreground hover:bg-accent/50 hover:text-accent-foreground',
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline: 'border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground [a&]:hover:bg-warning/90',
        success: 'border-transparent bg-success text-background [a&]:hover:bg-success/90',
        done: 'border-transparent bg-done text-background [a&]:hover:bg-done/90',
        // Soft tones: a tinted fill, border and text in one hue, to say what a badge means without shouting.
        muted: 'border border-border bg-muted/40 text-muted-foreground',
        'soft-success': 'border border-success/40 bg-success/15 text-success',
        'soft-info': 'border border-info/40 bg-info/15 text-info',
        'soft-warning': 'border border-warning/40 bg-warning/15 text-warning',
        'soft-destructive': 'border border-destructive/40 bg-destructive/15 text-destructive',
        'soft-done': 'border border-done/40 bg-done/15 text-done',
      },
    },
  },
)
