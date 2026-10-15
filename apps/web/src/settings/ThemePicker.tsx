import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { THEME_NAMES, THEMES, type ThemeName } from '../app/themes'

// What the Light button says instead of turning anything on. This pond is dark.
export const LIGHT_ROASTS = [
  'Light mode? In this pond? Flashbangs are for Counter-Strike, not code review.',
  '404: daylight not found. We do not serve your kind here.',
  'Your retinas filed a restraining order. We honored it.',
  'Light theme users are the reason monitors have a brightness button.',
  'Ducks sleep at night for a reason: the code is better in the dark.',
  'sudo apt remove light-mode. Done. You are welcome.',
]

function Swatches({ name }: { name: ThemeName }) {
  const { colors } = THEMES[name]
  return (
    <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-sm border border-border">
      {[colors.bg, colors.blue, colors.magenta, colors.green, colors.orange].map((color) => (
        <span key={color} className="size-3" style={{ background: color }} />
      ))}
    </span>
  )
}

export function ThemePicker({ value, onChange }: { value: ThemeName; onChange(theme: ThemeName): void }) {
  const [roast, setRoast] = useState(0)
  const nextRoast = () => setRoast((index) => (index + 1) % LIGHT_ROASTS.length)
  return (
    <div className="flex items-center gap-1">
      <Tooltip onOpenChange={(open) => open && nextRoast()}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Light theme"
            aria-disabled="true"
            className="text-muted-foreground line-through"
            onClick={() => {
              toast(LIGHT_ROASTS[roast])
              nextRoast()
            }}>
            <Sun />
            Light
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{LIGHT_ROASTS[roast]}</TooltipContent>
      </Tooltip>
      <Select value={value} onValueChange={(next: string) => onChange(next as ThemeName)}>
        <SelectTrigger aria-label="Theme" className="h-7 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_NAMES.map((name) => (
            <SelectItem key={name} value={name} title={THEMES[name].note}>
              <span className="flex items-center gap-2">
                <Swatches name={name} />
                {THEMES[name].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
