import { runGit } from './run'
import type { TreeRef } from './tree'

export type SymbolKind = 'definition' | 'import' | 'reference'

export interface SymbolHit {
  path: string
  line: number
  column: number
  text: string
  kind: SymbolKind
}

export interface SymbolResult {
  name: string
  hits: SymbolHit[]
  // More matches existed than were read.
  truncated: boolean
}

export const SYMBOL_NAME = /^[A-Za-z_$][\w$]{0,99}$/
const MAX_HITS = 600
const MAX_TEXT = 300

const escapeName = (name: string) => name.replace(/\$/g, '\\$')

// Lines that introduce the name rather than use it, across the languages a repo usually holds. A plain
// text match like this is what GitHub's search-based navigation does too; it needs no build or server.
function definitionPatterns(name: string): RegExp[] {
  const n = escapeName(name)
  return [
    // function, class, type and module keywords in JS/TS, Python, Go, Rust, Kotlin, Swift, Lua, Ruby, C#
    new RegExp(
      `\\b(function\\*?|class|interface|type|enum|namespace|module|struct|trait|impl|union|def|fn|func|fun|macro|record|protocol|extension)\\s+([\\w$]+[.:])?${n}\\b`,
    ),
    // Go methods: func (r T) Name(
    new RegExp(`\\bfunc\\s*\\([^)]*\\)\\s*${n}\\s*[(<\\[]`),
    // const, let, var and val declarations, including the first name of a destructuring
    new RegExp(`\\b(const|let|var|val|local)\\s+(\\{[^}]*\\b|\\[[^\\]]*\\b)?${n}\\b`),
    // class methods and object methods: name(args) {   or   async name<T>(args): R {
    new RegExp(
      `^\\s*((public|private|protected|static|async|readonly|override|abstract|get|set|export|default)\\s+)*\\*?${n}\\s*(<[^>]*>)?\\s*\\([^)]*\\)\\s*(:\\s*[^={;]+)?\\s*\\{`,
    ),
    // fields in interfaces, types, classes and object literals: name: T  or  name?: T
    new RegExp(`^\\s*((public|private|protected|static|readonly|declare)\\s+)*${n}\\??\\s*:(?!:)`),
    // assignments at the start of a statement, as Python and shell define names: name = value
    new RegExp(`^\\s*(export\\s+)?${n}\\s*(:[^=]+)?=(?![=>])`),
  ]
}

const IMPORT = /^\s*(import\b|export\s+\{[^}]*\}\s+from|from\s+\S+\s+import|use\s|require\(|#include)/

export function classify(name: string, text: string): SymbolKind {
  if (IMPORT.test(text)) return 'import'
  return definitionPatterns(name).some((pattern) => pattern.test(text)) ? 'definition' : 'reference'
}

// `git grep --column` at a commit prints "ref:path:line:column:text", in the working tree "path:line:column:text".
export function parseGrep(output: string, ref: TreeRef, name: string): SymbolHit[] {
  const prefix = ref === null ? '' : `${ref}:`
  const hits: SymbolHit[] = []
  for (const row of output.split('\n')) {
    if (!row) continue
    const rest = prefix && row.startsWith(prefix) ? row.slice(prefix.length) : row
    const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(rest)
    if (!match) continue
    const [, path = '', line = '0', column = '0', text = ''] = match
    hits.push({
      path,
      line: Number(line),
      column: Number(column),
      text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text,
      kind: classify(name, text),
    })
  }
  return hits
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/

// Definitions first (source before tests), then imports, then uses, each in path and line order.
const RANK: Record<SymbolKind, number> = { definition: 0, import: 1, reference: 2 }

export async function findSymbol(repo: string, name: string, ref: TreeRef): Promise<SymbolResult> {
  if (!SYMBOL_NAME.test(name)) return { name, hits: [], truncated: false }
  const args = ['grep', '-n', '--column', '-I', '-w', '-F', '--full-name', '--no-color']
  if (ref === null) args.push('--untracked')
  args.push('-e', name)
  if (ref !== null) args.push(ref)
  args.push('--')
  // git grep answers 1 when nothing matched.
  const output = await runGit(args, { cwd: repo, okExitCodes: [0, 1] })
  const all = parseGrep(output, ref, name)
  const hits = all
    .sort(
      (a, b) =>
        RANK[a.kind] - RANK[b.kind] ||
        Number(TEST_PATH.test(a.path)) - Number(TEST_PATH.test(b.path)) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line,
    )
    .slice(0, MAX_HITS)
  return { name, hits, truncated: all.length > MAX_HITS }
}
