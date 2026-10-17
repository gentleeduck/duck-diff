import { afterEach, describe, expect, it } from 'bun:test'
import type { ReviewComment } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { reviewPrompt } from '../review-prompt'

let repo: TestRepo
afterEach(() => repo.cleanup())

const comment = (fields: Partial<ReviewComment> & Pick<ReviewComment, 'path' | 'line' | 'body'>): ReviewComment => ({
  id: fields.body,
  target: { kind: 'local' },
  side: 'additions',
  lineHash: 'h',
  createdAt: 1,
  updatedAt: 1,
  ...fields,
})

describe('a review as a prompt', () => {
  it('names the comparison, then each file and its lines with the code quoted and the comment under it', async () => {
    repo = createRepo()
    repo.write('src/app.ts', 'const a = 1\nconst b = 2\n')
    repo.commit('base')
    repo.write('src/app.ts', 'const a = 1\nconst b = 3\nconst c = b * 2\nexport { a }\n')
    const text = await reviewPrompt(repo.path, { kind: 'local' }, [
      comment({ path: 'src/app.ts', startLine: 2, line: 3, body: 'Name these after what they hold.' }),
      comment({ path: 'src/app.ts', side: 'deletions', line: 2, body: 'Why did 2 have to go?' }),
    ])
    expect(text).toContain('HEAD to the working tree')
    expect(text).toContain('## src/app.ts, lines 2 to 3 (new)')
    expect(text).toContain('```ts\n2  const b = 3\n3  const c = b * 2\n```\n\nName these after what they hold.')
    expect(text).toContain('## src/app.ts, line 2 (old)')
    expect(text).toContain('```ts\n2  const b = 2\n```\n\nWhy did 2 have to go?')
  })

  it('quotes the exact words when only part of a line was picked', async () => {
    repo = createRepo()
    repo.write('a.py', 'total = price * count\n')
    repo.commit('base')
    repo.write('a.py', 'total = price * count + tax\n')
    const text = await reviewPrompt(repo.path, { kind: 'local' }, [
      comment({ path: 'a.py', line: 1, startCol: 22, endCol: 27, body: 'Tax is per item.' }),
    ])
    expect(text).toContain('On the words `+ tax`:')
    expect(text).toContain('```py\n1  total = price * count + tax\n```')
  })

  it('says so when the lines are gone from the comparison', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('base')
    const text = await reviewPrompt(repo.path, { kind: 'local' }, [
      comment({ path: 'gone.txt', line: 4, body: 'Still needed?' }),
    ])
    expect(text).toContain('## gone.txt, line 4 (new)')
    expect(text).toContain('(These lines are no longer in this comparison.)\n\nStill needed?')
  })
})
