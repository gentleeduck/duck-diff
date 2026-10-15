import { describe, expect, it } from 'bun:test'
import { createRepoMemo } from '../memo'

describe('repo memo', () => {
  it('keeps an answer until the repo changes', () => {
    const memo = createRepoMemo(4)
    const stamp = memo.stamp()
    memo.set('diff:local', 'patch', stamp)
    expect(memo.get('diff:local')).toBe('patch')
    memo.changed()
    expect(memo.get('diff:local')).toBeUndefined()
  })

  it('drops an answer computed across a change, which may be half old', () => {
    const memo = createRepoMemo(4)
    const stamp = memo.stamp()
    memo.changed()
    memo.set('diff:local', 'patch', stamp)
    expect(memo.get('diff:local')).toBeUndefined()
  })

  it('keeps only the most recent few', () => {
    const memo = createRepoMemo(2)
    const stamp = memo.stamp()
    memo.set('a', '1', stamp)
    memo.set('b', '2', stamp)
    memo.get('a')
    memo.set('c', '3', stamp)
    expect(memo.get('b')).toBeUndefined()
    expect(memo.get('a')).toBe('1')
    expect(memo.get('c')).toBe('3')
  })
})
