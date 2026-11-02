import { describe, expect, it } from 'vitest'
import { deleteBranchNote } from '../branch-actions'

describe('deleting a branch', () => {
  it('warns about the commits only when no comment goes with it', () => {
    expect(deleteBranchNote('feat', 0)).toBe(
      'Delete the branch feat? Its commits stay reachable only if another branch has them.',
    )
  })

  it('says how many comments are deleted with it', () => {
    expect(deleteBranchNote('feat', 1)).toBe(
      'Delete the branch feat? Its commits stay reachable only if another branch has them, and its comment is deleted with it.',
    )
    expect(deleteBranchNote('feat', 3)).toBe(
      'Delete the branch feat? Its commits stay reachable only if another branch has them, and its 3 comments are deleted with it.',
    )
  })

  it('warns that comments may go while their count is still unknown', () => {
    expect(deleteBranchNote('feat', undefined)).toBe(
      'Delete the branch feat? Its commits stay reachable only if another branch has them, and any comments on it are deleted with it.',
    )
  })
})
