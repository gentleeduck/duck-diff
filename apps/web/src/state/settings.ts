import type { DiffIndicators, HunkSeparators, LineDiffTypes } from '@pierre/diffs'
import { z } from 'zod'
import { DEFAULT_THEME, THEME_NAMES, type ThemeName } from '../app/themes'
import { DEFAULT_HIDE, type HidePattern } from '../lib/hide'
import { saved } from '../lib/saved'
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
  // Dark, always; which dark is yours.
  theme: ThemeName
  // Code in the diff and file views.
  fontSize: number
  // Everything else: text, buttons, rows and spacing scale together from this.
  uiFontSize: number
  // One weight and one style for every piece of text, code and terminals included.
  fontWeight: 400 | 500 | 600 | 700
  italic: boolean
  tabSize: number
  // Test files in a comparison: shown as usual, folded under their headers, or left out of diff and tree.
  tests: 'show' | 'fold' | 'hide'
  // Files left out of the tree and the diff, by path; the tests pattern comes first.
  hidePatterns: HidePattern[]
  // The left panel (tree, branches, files), hidden for a wider diff.
  sidebar: boolean
  // Browser notifications for review requests and failed runs of mine; off until asked for.
  desktopNotices: boolean
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
  theme: DEFAULT_THEME,
  fontSize: 15,
  uiFontSize: 15,
  fontWeight: 700,
  italic: true,
  tabSize: 2,
  tests: 'show',
  hidePatterns: DEFAULT_HIDE,
  sidebar: true,
  desktopNotices: false,
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
  theme: z.enum(THEME_NAMES as [ThemeName, ...ThemeName[]]),
  fontSize: z.number().int().min(10).max(24),
  uiFontSize: z.number().int().min(10).max(24),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
  italic: z.boolean(),
  tabSize: z.number().int().min(1).max(8),
  tests: z.enum(['show', 'fold', 'hide']),
  hidePatterns: z
    .array(z.object({ id: z.string(), label: z.string(), pattern: z.string(), enabled: z.boolean() }))
    .max(50),
  sidebar: z.boolean(),
  desktopNotices: z.boolean(),
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
  // Hiding tests used to be a choice of its own; it is now the tests pattern, switched on.
  if (result.tests === 'hide') {
    result.tests = 'show'
    result.hidePatterns = (result.hidePatterns as HidePattern[]).map((entry) =>
      entry.id === 'tests' ? { ...entry, enabled: true } : entry,
    )
  }
  return result as unknown as Settings
}

export function createSettingsStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = saved): Store<Settings> {
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

export const FONT_MIN = 10
export const FONT_MAX = 24
// The interface was drawn at 15px; everything sized in rem follows this ratio.
export const BASE_FONT = 15
