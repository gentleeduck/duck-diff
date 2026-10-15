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
export const CHEVRON = { closed: '', open: '' }

// Boxed diff glyphs, as in the editor's git column.
// nvim-tree's git marks (GitHub's octicon diff boxes), between the icon and the name.
export const STATUS_MARK: Record<FileStatus, { glyph: string; color: string; title: string }> = {
  modified: { glyph: '\uf459', color: 'var(--tn-fg-dark)', title: 'Modified' },
  'type-changed': { glyph: '\uf459', color: 'var(--tn-fg-dark)', title: 'Type changed' },
  added: { glyph: '\uf457', color: 'var(--tn-teal)', title: 'Added' },
  untracked: { glyph: '\uf457', color: 'var(--tn-teal)', title: 'Untracked' },
  copied: { glyph: '\uf457', color: 'var(--tn-teal)', title: 'Copied' },
  renamed: { glyph: '\uf45a', color: 'var(--tn-magenta)', title: 'Renamed' },
  deleted: { glyph: '\uf458', color: 'var(--tn-red)', title: 'Deleted' },
  conflicted: { glyph: '\uf47f', color: 'var(--tn-red)', title: 'Conflicted' },
}

// What a folder holds, as nvim-tree marks it: changed files, new files, or both.
export const FOLDER_DIRTY = { glyph: '\uf459', color: 'var(--tn-fg-dark)', title: 'Has changes' }
export const FOLDER_NEW = { glyph: '\uf457', color: 'var(--tn-teal)', title: 'Has new files' }
