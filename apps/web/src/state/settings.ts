import type { DiffIndicators, HunkSeparators, LineDiffTypes, ThemeTypes } from '@pierre/diffs'
import { z } from 'zod'
import { createStore, type Store } from '../lib/store'

export interface Settings {
  diffStyle: 'split' | 'unified'
  diffIndicators: DiffIndicators
  lineDiffType: LineDiffTypes
  hunkSeparators: Exclude<HunkSeparators, 'custom'>
  overflow: 'scroll' | 'wrap'
  lineNumbers: boolean
  backgrounds: boolean
  expandUnchanged: boolean
  themeType: ThemeTypes
  themes: { light: string; dark: string }
  fontSize: number
  tabSize: number
}

export const DEFAULT_SETTINGS: Settings = {
  diffStyle: 'split',
  diffIndicators: 'bars',
  lineDiffType: 'word-alt',
  hunkSeparators: 'line-info',
  overflow: 'scroll',
  lineNumbers: true,
  backgrounds: true,
  expandUnchanged: false,
  // Tokyo Night only comes dark, so the page starts dark to keep code readable.
  themeType: 'dark',
  themes: { light: 'tokyo-night', dark: 'tokyo-night' },
  fontSize: 15,
  tabSize: 2,
}

const KEY = 'duck-diff:settings'

// Each field is checked on its own so one bad value never resets the rest.
const FIELDS = {
  diffStyle: z.enum(['split', 'unified']),
  diffIndicators: z.enum(['classic', 'bars', 'none']),
  lineDiffType: z.enum(['word-alt', 'word-line', 'word', 'char', 'none']),
  hunkSeparators: z.enum(['simple', 'metadata', 'line-info', 'line-info-basic']),
  overflow: z.enum(['scroll', 'wrap']),
  lineNumbers: z.boolean(),
  backgrounds: z.boolean(),
  expandUnchanged: z.boolean(),
  themeType: z.enum(['system', 'light', 'dark']),
  themes: z.object({ light: z.string(), dark: z.string() }),
  fontSize: z.number().int().min(10).max(24),
  tabSize: z.number().int().min(1).max(8),
} satisfies { [K in keyof Settings]: z.ZodType<Settings[K]> }

function load(storage: Pick<Storage, 'getItem'> | null): Settings {
  let stored: Record<string, unknown>
  try {
    stored = JSON.parse(storage?.getItem(KEY) ?? '{}')
  } catch {
    return DEFAULT_SETTINGS
  }
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(FIELDS) as (keyof Settings)[]) {
    const parsed = FIELDS[key].safeParse(stored[key])
    if (parsed.success) result[key] = parsed.data
  }
  return result as unknown as Settings
}

export function createSettingsStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = globalThis.localStorage ?? null,
): Store<Settings> {
  const store = createStore(load(storage))
  store.subscribe(() => {
    try {
      storage?.setItem(KEY, JSON.stringify(store.get()))
    } catch {
      // Private windows and full quotas refuse writes; settings still work for this session.
    }
  })
  return store
}
