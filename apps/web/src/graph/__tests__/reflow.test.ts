import { describe, expect, it } from 'vitest'
import { reflow } from '../CommitMenu'

describe('reflow', () => {
  it('joins wrapped lines into paragraphs and keeps lists, blank lines and indented lines', () => {
    const body = [
      'Machine translation had no screen. An operator could not see which',
      'language was short of words.',
      '',
      '- one item that wraps',
      '  onto a second line',
      '- another',
      '',
      '    indented code',
    ].join('\n')
    expect(reflow(body)).toBe(
      [
        'Machine translation had no screen. An operator could not see which language was short of words.',
        '',
        '- one item that wraps',
        '  onto a second line',
        '- another',
        '',
        '    indented code',
      ].join('\n'),
    )
  })
})
