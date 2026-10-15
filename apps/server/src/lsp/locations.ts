import { isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LspLocation } from '@duck-diff/protocol'

type Position = { line: number; character: number }
export type Range = { start: Position; end: Position }
type RawLocation = {
  uri?: string
  range?: Range
  targetUri?: string
  targetSelectionRange?: Range
  targetRange?: Range
}
export type Encoding = 'utf-8' | 'utf-16' | 'utf-32'
export type ReadLines = (path: string) => Promise<string[] | null>

// Hover contents come as markup, a marked string, or a list of them; the page renders markdown.
export function hoverText(contents: unknown): string | null {
  if (!contents) return null
  if (typeof contents === 'string') return contents || null
  if (Array.isArray(contents)) {
    const parts = contents.map(hoverText).filter((part): part is string => Boolean(part))
    return parts.length ? parts.join('\n\n---\n\n') : null
  }
  const value = (contents as { value?: unknown }).value
  if (typeof value !== 'string' || !value) return null
  const language = (contents as { language?: unknown }).language
  return typeof language === 'string' ? `\`\`\`${language}\n${value}\n\`\`\`` : value
}

// One Location, a list of them, or LocationLinks; anything else (an empty object from Lua) is nothing.
export function toLocations(result: unknown): { uri: string; range: Range }[] {
  if (!result || typeof result !== 'object') return []
  const list = (Array.isArray(result) ? result : [result]) as RawLocation[]
  const out: { uri: string; range: Range }[] = []
  for (const entry of list) {
    const uri = entry.targetUri ?? entry.uri
    const range = entry.targetSelectionRange ?? entry.targetRange ?? entry.range
    if (uri && range) out.push({ uri, range })
  }
  return out
}

// A server's character offset turned into a JavaScript string index of the same line.
export function toUtf16(line: string, character: number, encoding: Encoding): number {
  if (encoding === 'utf-16') return character
  if (encoding === 'utf-32') {
    let index = 0
    for (let n = 0; n < character && index < line.length; n++) index += (line.codePointAt(index) ?? 0) > 0xffff ? 2 : 1
    return index
  }
  return new TextDecoder().decode(new TextEncoder().encode(line).subarray(0, character)).length
}

// Locations inside the repo, as paths with the line they point at; files elsewhere (libraries) are left out.
export async function resolveLocations(
  repo: string,
  raw: { uri: string; range: Range }[],
  readLines: ReadLines,
  encoding: Encoding = 'utf-16',
): Promise<LspLocation[]> {
  const files = new Map<string, Promise<string[] | null>>()
  const out: LspLocation[] = []
  const seen = new Set<string>()
  for (const { uri, range } of raw) {
    if (!uri.startsWith('file:')) continue
    const path = relative(repo, fileURLToPath(uri))
    if (!path || path.startsWith('..') || isAbsolute(path)) continue
    let read = files.get(path)
    if (!read) {
      read = readLines(path)
      files.set(path, read)
    }
    const lines = await read
    const at = (row: number) => (lines?.[row] ?? '').replace(/\r$/, '')
    const location = {
      path,
      line: range.start.line + 1,
      column: toUtf16(at(range.start.line), range.start.character, encoding) + 1,
      endLine: range.end.line + 1,
      endColumn: toUtf16(at(range.end.line), range.end.character, encoding) + 1,
      text: at(range.start.line).slice(0, 300),
    }
    const key = `${path}:${location.line}:${location.column}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(location)
  }
  return out
}
