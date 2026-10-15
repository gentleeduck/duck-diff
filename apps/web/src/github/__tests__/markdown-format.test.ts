import { describe, expect, it } from 'vitest'
import { applyFormat } from '../markdown-format'

describe('markdown toolbar', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(applyFormat('make it loud', 8, 12, 'bold')).toEqual({ value: 'make it **loud**', start: 10, end: 14 })
    expect(applyFormat('run npm i', 4, 9, 'code')).toEqual({ value: 'run `npm i`', start: 5, end: 10 })
    expect(applyFormat('a\nb', 0, 3, 'code').value).toBe('```\na\nb\n```')
  })

  it('makes a link with the url selected for typing', () => {
    const edit = applyFormat('see docs', 4, 8, 'link')
    expect(edit.value).toBe('see [docs](url)')
    expect(edit.value.slice(edit.start, edit.end)).toBe('url')
  })

  it('starts each selected line, numbering ordered lists', () => {
    expect(applyFormat('one\ntwo', 0, 7, 'ordered').value).toBe('1. one\n2. two')
    expect(applyFormat('x\none\ntwo', 3, 9, 'task').value).toBe('x\n- [ ] one\n- [ ] two')
    expect(applyFormat('title', 2, 2, 'heading').value).toBe('### title')
  })
})
