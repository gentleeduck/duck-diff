import type { FileStatus } from '@duck-diff/protocol'

// Nerd Font glyphs and colors as nvim-web-devicons and nvim-tree draw them, so the tree reads like the editor's.
interface Glyph {
  glyph: string
  color: string
}

const BY_EXTENSION: Record<string, Glyph> = {
  ts: { glyph: '', color: '#519aba' },
  mts: { glyph: '', color: '#519aba' },
  cts: { glyph: '', color: '#519aba' },
  tsx: { glyph: '', color: '#1354bf' },
  js: { glyph: '', color: '#cbcb41' },
  mjs: { glyph: '', color: '#cbcb41' },
  cjs: { glyph: '', color: '#cbcb41' },
  jsx: { glyph: '', color: '#20c2e3' },
  json: { glyph: '', color: '#cbcb41' },
  md: { glyph: '', color: '#dddddd' },
  mdx: { glyph: '', color: '#519aba' },
  css: { glyph: '', color: '#42a5f5' },
  scss: { glyph: '', color: '#f55385' },
  html: { glyph: '', color: '#e44d26' },
  lua: { glyph: '', color: '#51a0cf' },
  go: { glyph: '', color: '#00add8' },
  rs: { glyph: '', color: '#dea584' },
  py: { glyph: '', color: '#ffbc03' },
  sh: { glyph: '', color: '#4d5a5e' },
  yml: { glyph: '', color: '#6d8086' },
  yaml: { glyph: '', color: '#6d8086' },
  toml: { glyph: '', color: '#9c4221' },
  lock: { glyph: '', color: '#bbbbbb' },
  png: { glyph: '', color: '#a074c4' },
  jpg: { glyph: '', color: '#a074c4' },
  jpeg: { glyph: '', color: '#a074c4' },
  gif: { glyph: '', color: '#a074c4' },
  webp: { glyph: '', color: '#a074c4' },
  svg: { glyph: '', color: '#ffb13b' },
  txt: { glyph: '', color: '#89e051' },
}

const BY_NAME: Record<string, Glyph> = {
  'package.json': { glyph: '', color: '#e8274b' },
  '.gitignore': { glyph: '', color: '#41535b' },
  '.env': { glyph: '', color: '#faf743' },
  Makefile: { glyph: '', color: '#6d8086' },
  Dockerfile: { glyph: '', color: '#458ee6' },
}

const FALLBACK: Glyph = { glyph: '', color: '#6d8086' }

export function fileGlyph(name: string): Glyph {
  if (BY_NAME[name]) return BY_NAME[name]
  if (name.startsWith('.env')) return BY_NAME['.env'] ?? FALLBACK
  const extension = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
  return BY_EXTENSION[extension] ?? FALLBACK
}

// README and friends are highlighted the way nvim-tree marks "special files".
export function isSpecialFile(name: string): boolean {
  return /^(readme|license|changelog|makefile|cargo\.toml)(\.|$)/i.test(name)
}

export const FOLDER = { closed: '', open: '', color: 'var(--tn-blue)' }
// nvim-tree's mark for a folder that is another repository.
export const SUBMODULE = { glyph: '\uf414', color: 'var(--tn-magenta)' }
// nvim-tree's arrow_closed and arrow_open (Font Awesome chevrons).
export const CHEVRON = { closed: '\uf054', open: '\uf078' }

type Kind = 'dirty' | 'renamed' | 'deleted' | 'merge' | 'new'

// nvim-tree's git glyphs and tokyonight's colors for them, in the order nvim-tree lists a folder's marks.
const KINDS: Record<Kind, { glyph: string; color: string; folder: string }> = {
  dirty: { glyph: '\uf459', color: 'var(--tn-git-change)', folder: 'Has changes' },
  renamed: { glyph: '\u279c', color: 'var(--tn-cyan)', folder: 'Has renames' },
  deleted: { glyph: '\uf458', color: 'var(--tn-git-delete)', folder: 'Has deletions' },
  merge: { glyph: '\uf0c8', color: 'var(--tn-orange)', folder: 'Has conflicts' },
  new: { glyph: '\uf457', color: 'var(--tn-git-add)', folder: 'Has new files' },
}
const ORDER: Kind[] = ['dirty', 'renamed', 'deleted', 'merge', 'new']

const KIND_OF: Record<FileStatus, Kind> = {
  modified: 'dirty',
  'type-changed': 'dirty',
  added: 'new',
  untracked: 'new',
  copied: 'new',
  renamed: 'renamed',
  deleted: 'deleted',
  conflicted: 'merge',
}

const TITLES: Record<FileStatus, string> = {
  modified: 'Modified',
  'type-changed': 'Type changed',
  added: 'Added',
  untracked: 'Untracked',
  copied: 'Copied',
  renamed: 'Renamed',
  deleted: 'Deleted',
  conflicted: 'Conflicted',
}

// A file's git mark, between its icon and its name.
export const STATUS_MARK = Object.fromEntries(
  Object.entries(KIND_OF).map(([status, kind]) => [
    status,
    { glyph: KINDS[kind].glyph, color: KINDS[kind].color, title: TITLES[status as FileStatus] },
  ]),
) as Record<FileStatus, { glyph: string; color: string; title: string }>

// highlight_git: a name takes its status's color; a special file keeps its underline under that color.
export function fileLook(name: string, status: FileStatus | undefined): { color: string; underline: boolean } {
  const underline = isSpecialFile(name.split('/').pop() ?? name)
  if (status) return { color: KINDS[KIND_OF[status]].color, underline }
  return { color: underline ? '#ff80ff' : 'var(--tn-fg-dark)', underline }
}

// A folder shows every kind of change under it, in nvim-tree's order. Its name takes the new-file color
// when it holds one, as nvim-tree draws it, and otherwise the first kind's.
export function folderLook(statuses: Iterable<FileStatus>): {
  marks: { glyph: string; color: string; title: string }[]
  color: string
} {
  const present = new Set([...statuses].map((status) => KIND_OF[status]))
  const kinds = ORDER.filter((kind) => present.has(kind))
  const lead = present.has('new') ? 'new' : kinds[0]
  return {
    marks: kinds.map((kind) => ({ glyph: KINDS[kind].glyph, color: KINDS[kind].color, title: KINDS[kind].folder })),
    color: lead ? KINDS[lead].color : 'var(--tn-blue)',
  }
}
