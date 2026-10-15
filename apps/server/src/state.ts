import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { repoId } from '@duck-diff/git'
import { type DiffTarget, DiffTargetSchema } from '@duck-diff/protocol'

// Bumped when the file's shape changes, so an older one is ignored rather than misread.
const VERSION = 1

export type StateValues = Record<string, string>

export interface StateStore {
  values(): Promise<StateValues>
  // null removes a key.
  update(changes: Record<string, string | null>): Promise<void>
  // The page's query cache for this repo, as the persister wrote it.
  queries(): Promise<string | null>
  setQueries(text: string): Promise<void>
}

async function writeAtomic(file: string, text: string) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, text)
  await rename(temp, file)
}

async function readValues(file: string): Promise<StateValues> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { version?: number; values?: unknown }
    if (parsed.version !== VERSION || !parsed.values || typeof parsed.values !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed.values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

// What the page would otherwise keep in the browser (settings, keys, panel sizes, tabs, viewed files), kept
// in the data folder the way Neovim plugins keep theirs, so clearing the browser loses nothing. One file for
// the user, shared by every repo's server; the query cache is per repo, beside the other caches.
export function createStateStore(data: string, repo: string): StateStore {
  const file = join(data, 'duck-diff', 'state.json')
  const queriesFile = join(data, 'duck-diff', repoId(repo), 'cache', 'queries.json')
  // Writes go one after another, each merged into what the file has now, so two servers never drop each
  // other's keys.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task)
    queue = next.catch(() => {})
    return next
  }

  return {
    values: () => serial(() => readValues(file)),
    update: (changes) =>
      serial(async () => {
        const values = await readValues(file)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) delete values[key]
          else values[key] = value
        }
        await writeAtomic(file, JSON.stringify({ version: VERSION, values }))
      }),
    queries: () => readFile(queriesFile, 'utf8').catch(() => null),
    setQueries: (text) => serial(() => writeAtomic(queriesFile, text)),
  }
}

// The values ride in the page itself, so stores read them while they are created, and the saved query
// answers paint before any request is made.
export function pageState(html: string, values: StateValues, queries: string | null = null): string {
  const json = JSON.stringify(values).replace(/</g, '\\u003c')
  // Saved as JSON already; a < can only sit inside one of its strings, where \u003c reads the same.
  const saved = queries
    ? `<script id="duck-diff-queries" type="application/json">${queries.replace(/</g, '\\u003c')}</script>`
    : ''
  return html.replace('</head>', `<script id="duck-diff-state" type="application/json">${json}</script>${saved}</head>`)
}

// For servers that keep nothing on disk (tests): the same store, held in memory.
export function createMemoryState(): StateStore {
  const values: StateValues = {}
  let queries: string | null = null
  return {
    values: async () => ({ ...values }),
    update: async (changes) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) delete values[key]
        else values[key] = value
      }
    },
    queries: async () => queries,
    setQueries: async (text) => {
      queries = text
    },
  }
}

// Past this the page is better off streaming it than parsing it all before its first paint.
const SEED_MAX = 1_000_000

// The diff the page opens on, when the server already holds it: the page draws it in its first frame.
export function pageDiff(
  html: string,
  key: string,
  files: string | undefined,
  patch: string | undefined,
  tokens?: string,
): string {
  if (files === undefined || patch === undefined || patch.length > SEED_MAX) return html
  const colors = tokens ? `,"tokens":${tokens}` : ''
  const seed = `{"key":${JSON.stringify(key)},"files":${files},"patch":${JSON.stringify(patch)}${colors}}`
  const safe = seed.replace(/</g, '\\u003c')
  return html.replace('</head>', `<script id="duck-diff-diff" type="application/json">${safe}</script></head>`)
}

// The comparison a page url opens on, when it opens on the diff: /changes, or / as older links have it.
export function openingTarget(url: URL): DiffTarget | null {
  const view = url.searchParams.get('view')
  if (!(url.pathname === '/changes' || (url.pathname === '/' && (!view || view === 'changes')))) return null
  const raw = url.searchParams.get('target')
  if (!raw) return { kind: 'local' }
  try {
    const parsed = DiffTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// The graph the page opens on, when the server holds it, with the refs that name its remote branches.
export function pageGraph(html: string, key: string, text: string | undefined, refs: string | undefined): string {
  if (text === undefined || refs === undefined || text.length > SEED_MAX) return html
  const seed = `{"key":${JSON.stringify(key)},"text":${JSON.stringify(text)},"refs":${refs}}`.replace(/</g, '\\u003c')
  return html.replace('</head>', `<script id="duck-diff-graph" type="application/json">${seed}</script></head>`)
}

export const opensGraph = (url: URL) =>
  url.pathname === '/graph' || (url.pathname === '/' && url.searchParams.get('view') === 'graph')
