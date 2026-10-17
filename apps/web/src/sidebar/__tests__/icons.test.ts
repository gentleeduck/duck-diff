import { describe, expect, it } from 'vitest'
import { fileLook, folderLook } from '../icons'

describe('git look, as nvim-tree draws it', () => {
  it('colors a file by its status, keeping the underline of a special file', () => {
    expect(fileLook('src/app.ts', 'modified')).toEqual({ color: 'var(--tn-git-change)', underline: false })
    expect(fileLook('src/new.ts', 'untracked').color).toBe('var(--tn-git-add)')
    expect(fileLook('old.ts', 'deleted').color).toBe('var(--tn-git-delete)')
    expect(fileLook('README.md', 'modified')).toEqual({ color: 'var(--tn-git-change)', underline: true })
    expect(fileLook('README.md', undefined)).toEqual({ color: '#ff80ff', underline: true })
    expect(fileLook('src/app.ts', undefined)).toEqual({ color: 'var(--tn-fg-dark)', underline: false })
  })

  it('marks a folder with every kind of change under it, in nvim-tree order, named in the new color first', () => {
    const look = folderLook(['untracked', 'modified', 'deleted', 'modified'])
    expect(look.marks.map((mark) => mark.title)).toEqual(['Has changes', 'Has deletions', 'Has new files'])
    expect(look.color).toBe('var(--tn-git-add)')
    expect(folderLook(['modified']).color).toBe('var(--tn-git-change)')
    expect(folderLook(['deleted', 'modified']).color).toBe('var(--tn-git-change)')
    expect(folderLook([]).color).toBe('var(--tn-blue)')
  })
})
