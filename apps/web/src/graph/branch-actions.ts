import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'

// Deleting a branch from here deletes its comments too, so the question says how many. Undefined is a count not
// read yet.
export function deleteBranchNote(name: string, comments: number | undefined): string {
  const base = `Delete the branch ${name}? Its commits stay reachable only if another branch has them`
  if (comments === undefined) return `${base}, and any comments on it are deleted with it.`
  if (!comments) return `${base}.`
  return `${base}, and ${comments === 1 ? 'its comment is' : `its ${comments} comments are`} deleted with it.`
}

export function useBranchComments(name: string): number | undefined {
  const { queries } = useApp()
  const counts = useQuery(queries.git.reviewOverview()).data?.counts
  if (!counts) return undefined
  return Object.hasOwn(counts, name) ? counts[name] : 0
}

// Deletes or renames a branch, and its open tabs close or follow the new name. Its comments go or follow on the
// server.
export function useBranchActions() {
  const { tabs } = useApp()
  const { run } = useGit()
  const { navigate } = useTarget()
  const show = (tab: { target: Parameters<typeof navigate>[0] } | null) => {
    if (tab) navigate(tab.target, true)
  }
  return {
    async remove(name: string, force: boolean) {
      if (await run('branch-delete', { name, force }, `Deleted ${name}`)) show(tabs.dropBranch(name))
    },
    async rename(from: string, to: string) {
      if (await run('branch-rename', { from, to }, `Renamed to ${to}`)) show(tabs.followRename(from, to))
    },
  }
}
