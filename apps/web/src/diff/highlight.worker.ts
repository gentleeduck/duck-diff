import { type BundledLanguage, bundledLanguages, createHighlighter } from 'shiki'
import type { HighlightRequest, HighlightResponse, Token } from './highlight'
import { TOKYONIGHT_NIGHT } from './tokyonight-theme'

const THEME = TOKYONIGHT_NIGHT.name as string
let highlighter: ReturnType<typeof createHighlighter> | null = null

// Shiki runs here directly: the diff library only lets its own workers load grammars.
async function tokenize(lang: string, runs: string[]): Promise<Token[][][]> {
  highlighter ??= createHighlighter({ themes: [TOKYONIGHT_NIGHT], langs: [] })
  const shiki = await highlighter
  const known = lang in bundledLanguages
  if (known && !shiki.getLoadedLanguages().includes(lang)) await shiki.loadLanguage(lang as BundledLanguage)
  return runs.map((text) =>
    shiki
      .codeToTokens(text, { lang: known ? (lang as BundledLanguage) : 'text', theme: THEME })
      .tokens.map((line) => line.map((token): Token => [token.content, token.color ?? '', token.fontStyle ?? 0])),
  )
}

self.onmessage = async (event: MessageEvent<HighlightRequest>) => {
  const { id, lang, runs } = event.data
  try {
    self.postMessage({ id, runs: await tokenize(lang, runs) } satisfies HighlightResponse)
  } catch (error) {
    self.postMessage({ id, runs: null, error: String(error) } satisfies HighlightResponse)
  }
}
