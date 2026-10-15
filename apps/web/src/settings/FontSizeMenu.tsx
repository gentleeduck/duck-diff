import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Minus, Plus, RotateCcw, Type } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useSettings } from '../hooks/useSettings'
import { BASE_FONT, FONT_MAX, FONT_MIN, type Settings } from '../state/settings'

const clamp = (size: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, size))
const selectSizes = (state: Settings) => `${state.fontSize}:${state.uiFontSize}`

type Scope = 'both' | 'code' | 'ui'

// One step for everything (Ctrl + and Ctrl -), or the code and the interface apart.
export function resize(prev: Settings, scope: Scope, step: number): Settings {
  return {
    ...prev,
    fontSize: scope === 'ui' ? prev.fontSize : clamp(prev.fontSize + step),
    uiFontSize: scope === 'code' ? prev.uiFontSize : clamp(prev.uiFontSize + step),
  }
}

function Row({ label, size, scope }: { label: string; size: number; scope: Scope }) {
  const { settings } = useApp()
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <Button
        size="icon"
        variant="outline"
        aria-label={`Smaller ${label.toLowerCase()}`}
        disabled={size <= FONT_MIN}
        onClick={() => settings.set((prev) => resize(prev, scope, -1))}>
        <Minus />
      </Button>
      <span className="w-12 text-center text-foreground tabular-nums">{size}px</span>
      <Button
        size="icon"
        variant="outline"
        aria-label={`Bigger ${label.toLowerCase()}`}
        disabled={size >= FONT_MAX}
        onClick={() => settings.set((prev) => resize(prev, scope, 1))}>
        <Plus />
      </Button>
    </div>
  )
}

export function FontSizeMenu() {
  const { settings } = useApp()
  const [code, ui] = useSettings(selectSizes).split(':').map(Number) as [number, number]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Font size" className="gap-1.5 tabular-nums">
          <Type />
          {code === ui ? code : `${ui}/${code}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <p className="text-foreground">Font size</p>
        <Row label="Everything" size={Math.max(code, ui)} scope="both" />
        <Row label="Code" size={code} scope="code" />
        <Row label="Interface" size={ui} scope="ui" />
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Ctrl + and Ctrl - change everything</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => settings.set((prev) => ({ ...prev, fontSize: BASE_FONT, uiFontSize: BASE_FONT }))}>
            <RotateCcw />
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
