import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from '@duck-diff/ui'
import { Minus, Plus, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useSettings } from '../hooks/useSettings'
import { DEFAULT_SETTINGS, type Settings } from '../state/settings'
import { ThemePicker } from './ThemePicker'

const selectAll = (state: Settings) => state

type Options<K extends keyof Settings> = { value: Settings[K]; label: string }[]

const WEIGHTS: { value: Settings['fontWeight']; label: string }[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
]

const TESTS: Options<'tests'> = [
  { value: 'show', label: 'Show' },
  { value: 'fold', label: 'Fold' },
]

const INDICATORS: Options<'diffIndicators'> = [
  { value: 'bars', label: 'Bars' },
  { value: 'classic', label: '+ and -' },
  { value: 'none', label: 'None' },
]
const INLINE: Options<'lineDiffType'> = [
  { value: 'word-alt', label: 'Words' },
  { value: 'word', label: 'Words, strict' },
  { value: 'word-line', label: 'Words in whole lines' },
  { value: 'char', label: 'Characters' },
  { value: 'none', label: 'Off' },
]
const SEPARATORS: Options<'hunkSeparators'> = [
  { value: 'line-info', label: 'Line ranges' },
  { value: 'line-info-basic', label: 'Line ranges, compact' },
  { value: 'metadata', label: 'Hunk headers' },
  { value: 'simple', label: 'Plain divider' },
]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span>{label}</span>
      {children}
    </div>
  )
}

export function SettingsPopover() {
  const { settings: store, api } = useApp()
  const settings = useSettings(selectAll)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => store.set((prev) => ({ ...prev, [key]: value }))

  const choice = <K extends 'diffIndicators' | 'lineDiffType' | 'hunkSeparators' | 'tests'>(
    key: K,
    options: Options<K>,
    label: string,
  ) => (
    <Row label={label}>
      <Select value={settings[key]} onValueChange={(value: string) => set(key, value as Settings[K])}>
        <SelectTrigger aria-label={label} className="h-7 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  )

  // The browser asks the reader once; a refusal leaves the switch off.
  const setNotices = async (next: boolean) => {
    if (next && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.error('Notifications are blocked', { description: 'The browser did not allow them for this page.' })
        return
      }
    }
    set('desktopNotices', next)
  }

  const toggle = (key: 'overflow' | 'lineNumbers' | 'backgrounds' | 'expandUnchanged', label: string) => {
    const checked = key === 'overflow' ? settings.overflow === 'wrap' : settings[key]
    return (
      <Row label={label}>
        <Switch
          className="border-muted-foreground"
          aria-label={label}
          checked={checked}
          onCheckedChange={(next: boolean) =>
            key === 'overflow' ? set('overflow', next ? 'wrap' : 'scroll') : set(key, next)
          }
        />
      </Row>
    )
  }

  const stepper = (key: 'fontSize' | 'uiFontSize' | 'tabSize', label: string, min: number, max: number) => (
    <Row label={label}>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={settings[key] <= min}
          onClick={() => set(key, settings[key] - 1)}>
          <Minus />
        </Button>
        <output className="w-6 text-center tabular-nums">{settings[key]}</output>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={settings[key] >= max}
          onClick={() => set(key, settings[key] + 1)}>
          <Plus />
        </Button>
      </div>
    </Row>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Diff settings">
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem]">
        <Row label="Layout">
          <ToggleGroup
            type="single"
            value={settings.diffStyle}
            onValueChange={(value: string) => value && set('diffStyle', value as Settings['diffStyle'])}>
            <ToggleGroupItem value="split" size="sm">
              Split
            </ToggleGroupItem>
            <ToggleGroupItem value="unified" size="sm">
              Stacked
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label="Theme">
          <ThemePicker value={settings.theme} onChange={(theme) => set('theme', theme)} />
        </Row>
        {choice('lineDiffType', INLINE, 'Inline changes')}
        {choice('diffIndicators', INDICATORS, 'Change markers')}
        {choice('hunkSeparators', SEPARATORS, 'Hunk separators')}
        {choice('tests', TESTS, 'Test files')}
        {toggle('overflow', 'Wrap long lines')}
        {toggle('lineNumbers', 'Line numbers')}
        {toggle('backgrounds', 'Line backgrounds')}
        {toggle('expandUnchanged', 'Show unchanged lines')}
        {stepper('fontSize', 'Code size', 10, 24)}
        {stepper('uiFontSize', 'Interface size', 10, 24)}
        <Row label="Font weight">
          <Select
            value={String(settings.fontWeight)}
            onValueChange={(value: string) => set('fontWeight', Number(value) as Settings['fontWeight'])}>
            <SelectTrigger aria-label="Font weight" className="h-7 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEIGHTS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Italic">
          <Switch
            className="border-muted-foreground"
            aria-label="Italic"
            checked={settings.italic}
            onCheckedChange={(next: boolean) => set('italic', next)}
          />
        </Row>
        {stepper('tabSize', 'Tab width', 1, 8)}
        <Row label="Desktop notifications">
          <Switch
            className="border-muted-foreground"
            aria-label="Desktop notifications"
            checked={settings.desktopNotices}
            onCheckedChange={(next: boolean) => void setNotices(next)}
          />
        </Row>
        <div className="mt-2 grid grid-cols-2 gap-2 border-border border-t pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              api.clearCache().then(
                () =>
                  toast.success('Cleared the saved answers', {
                    description: 'GitHub answers, commits and the graph are read again when next shown.',
                  }),
                (error: Error) => toast.error('Could not clear the saved answers', { description: error.message }),
              )
            }>
            Clear cache
          </Button>
          <Button variant="outline" size="sm" onClick={() => store.set(DEFAULT_SETTINGS)}>
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
