import { describe, expect, it } from 'vitest'
import { applyTheme, THEME_NAMES, THEMES, themeVariables } from '../themes'

describe('themes', () => {
  it('leaves tokyo night to the stylesheet and gives every other theme all its colors', () => {
    expect(themeVariables('tokyo-night')).toEqual({})
    for (const name of THEME_NAMES.filter((each) => each !== 'tokyo-night')) {
      const vars = themeVariables(name)
      expect(vars['--tn-bg']).toBe(THEMES[name].colors.bg)
      expect(vars['--syn-string']).toBe(THEMES[name].colors.green)
      expect(vars['--diff-add-bg']).toContain('color-mix')
    }
  })

  it('switches on <html> and back without leaving colors behind', () => {
    const root = document.createElement('html')
    applyTheme('dracula', root)
    expect(root.style.getPropertyValue('--tn-bg')).toBe('#282a36')
    expect(root.dataset.theme).toBe('dracula')
    expect(root.classList.contains('dark')).toBe(true)
    applyTheme('tokyo-night', root)
    expect(root.style.getPropertyValue('--tn-bg')).toBe('')
    expect(root.style.getPropertyValue('--syn-string')).toBe('')
  })
})
