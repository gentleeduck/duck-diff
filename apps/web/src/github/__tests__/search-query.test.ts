import { describe, expect, it } from 'vitest'
import { setQualifier, toggleQualifier, valuesOf } from '../search-query'

describe('search box qualifiers', () => {
  it('sets one value, replacing the old one and keeping the free text', () => {
    expect(setQualifier('fix author:octo', 'author', 'duck')).toBe('fix author:duck')
    expect(setQualifier('fix author:octo', 'author', null)).toBe('fix')
    expect(setQualifier('', 'milestone', 'v1 beta')).toBe('milestone:"v1 beta"')
  })

  it('toggles repeating values like labels, quoted when they hold spaces', () => {
    const one = toggleQualifier('', 'label', 'area: web')
    expect(one).toBe('label:"area: web"')
    const two = toggleQualifier(one, 'label', 'bug')
    expect(valuesOf(two, 'label')).toEqual(['area: web', 'bug'])
    expect(toggleQualifier(two, 'label', 'area: web')).toBe('label:bug')
  })
})
