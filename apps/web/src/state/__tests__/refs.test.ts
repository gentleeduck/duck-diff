import { describe, expect, it } from 'vitest'
import { FILES, fakeApi, PATCH } from '../../test/fake-api'
import { createRefs } from '../refs'
import { createSession } from '../session'

describe('refs', () => {
  it('tells a repo with no refs yet from refs still being read', async () => {
    const api = fakeApi()
    const session = createSession(api, { kind: 'local' }, { key: 'local', files: FILES, patch: PATCH })
    let answer: () => void = () => {}
    const refs = createRefs(api, session, {
      refs: () => new Promise((resolve) => (answer = () => resolve([]))),
      commits: async () => [],
    })
    refs.load()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refs.get()).toEqual({ refs: [], commits: [], loaded: false })
    answer()
    await expect.poll(() => refs.get().loaded).toBe(true)
    expect(refs.get().refs).toEqual([])
  })
})
