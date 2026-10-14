export interface ICommandBadgeProps extends React.HTMLProps<HTMLElement> {
  variant?: 'default' | 'secondary'
  /** The keyboard shortcut keys (e.g., "mod+k", which is Cmd on Mac and Ctrl elsewhere). */
  keys?: string
  /** Callback function that is invoked when the shortcut keys are pressed. */
  onKeysPressed?: () => void
}
