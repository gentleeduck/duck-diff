'use client'
import { cn } from '@gentleduck/libs/cn'
import { Slot, Slottable } from '@gentleduck/primitives/slot'
import { Loader } from 'lucide-react'
import * as React from 'react'
import { labelled } from '../_internal/label'
import { buttonVariants } from './button.constants'
import type { AnimationIconProps, ButtonProps } from './button.types'

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'default',
      size = 'default',
      border = 'default',
      asChild,
      className,
      loading,
      isCollapsed,
      icon,
      secondIcon,
      type = 'button',
      disabled,
      ...props
    },
    ref,
  ) => {
    // While loading, the spinner takes the place of the button's own icon instead of sitting beside it.
    const buttonClass = cn(
      buttonVariants({ border, className, size: isCollapsed ? 'icon' : size, variant }),
      'data-loading:[&>svg+svg]:hidden',
    )

    if (asChild) {
      return (
        <Slot data-slot="button" {...props} className={buttonClass} ref={ref}>
          {children}
        </Slot>
      )
    }

    return (
      <button
        data-slot="button"
        {...props}
        aria-busy={loading ? true : undefined}
        data-loading={loading ? '' : undefined}
        className={buttonClass}
        disabled={Boolean(loading) || disabled}
        ref={ref}
        type={type}>
        {loading ? <Loader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : icon}
        <Slottable>{!isCollapsed && labelled(children)}</Slottable>
        {!isCollapsed && secondIcon && secondIcon}
      </button>
    )
  },
)
Button.displayName = 'Button'

function AnimationIcon({ children, animationIcon }: AnimationIconProps): React.JSX.Element {
  return (
    <>
      {animationIcon?.icon && animationIcon.iconPlacement === 'left' && (
        <div className="w-0 pe-0 opacity-0 transition-[width,padding,opacity,translate] duration-200 ease-(--gentleduck-motion-ease) group-hover:w-5 group-hover:pe-2 group-hover:opacity-100 ltr:translate-x-[-1.3em] ltr:group-hover:-translate-x-1 rtl:translate-x-[1.3em] rtl:group-hover:translate-x-1">
          {animationIcon?.icon}
        </div>
      )}
      {children}
      {animationIcon?.icon && animationIcon.iconPlacement === 'right' && (
        <div className="w-0 ps-0 opacity-0 transition-[width,padding,opacity,translate] duration-200 ease-(--gentleduck-motion-ease) group-hover:w-5 group-hover:translate-x-0 group-hover:ps-2 group-hover:opacity-100 ltr:translate-x-[1.3em] rtl:translate-x-[-1.3em]">
          {animationIcon?.icon}
        </div>
      )}
    </>
  )
}
AnimationIcon.displayName = 'AnimationIcon'

export { AnimationIcon, Button }
