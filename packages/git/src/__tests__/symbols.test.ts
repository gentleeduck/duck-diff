import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { classify, findSymbol } from '../index'

let repo: TestRepo | undefined
afterEach(() => repo?.cleanup())

describe('symbols', () => {
  it('tells definitions, imports and uses apart across languages', () => {
    expect(classify('render', 'export function render(view: View) {')).toBe('definition')
    expect(classify('Viewer', 'export default class Viewer extends Base {')).toBe('definition')
    expect(classify('Props', 'interface Props {')).toBe('definition')
    expect(classify('limit', 'const limit = 10')).toBe('definition')
    expect(classify('limit', '  limit?: number')).toBe('definition')
    expect(classify('load', '  async load(target: Target): Promise<void> {')).toBe('definition')
    expect(classify('parse', 'def parse(text):')).toBe('definition')
    expect(classify('Serve', 'func (s *Server) Serve(ctx context.Context) error {')).toBe('definition')
    expect(classify('open', 'pub fn open(path: &str) -> File {')).toBe('definition')
    expect(classify('setup', 'local function setup(opts)')).toBe('definition')
    expect(classify('render', "import { render } from './render'")).toBe('import')
    expect(classify('render', '  return render(view)')).toBe('reference')
    expect(classify('limit', 'if (count === limit) stop()')).toBe('reference')
  })

  it('finds a name in the working tree or a commit, definitions first and tests after source', async () => {
    const made = createRepo()
    repo = made
    made.write('src/a.ts', 'export function answer() {\n  return 42\n}\n')
    made.write('src/b.ts', "import { answer } from './a'\nconsole.log(answer())\n")
    made.commit('base')
    made.write('src/__tests__/a.test.ts', 'const answer = 1\n')
    made.write('src/c.ts', 'answer()\nanswered()\n')

    const now = await findSymbol(made.path, 'answer', null)
    expect(now.hits.map((hit) => [hit.path, hit.line, hit.column, hit.kind])).toEqual([
      ['src/a.ts', 1, 17, 'definition'],
      ['src/__tests__/a.test.ts', 1, 7, 'definition'],
      ['src/b.ts', 1, 10, 'import'],
      ['src/b.ts', 2, 13, 'reference'],
      ['src/c.ts', 1, 1, 'reference'],
    ])
    const before = await findSymbol(made.path, 'answer', 'HEAD')
    expect(before.hits.map((hit) => hit.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/b.ts'])
    expect((await findSymbol(made.path, 'nothing', null)).hits).toEqual([])
    expect((await findSymbol(made.path, 'not a name', null)).hits).toEqual([])
  })
})
