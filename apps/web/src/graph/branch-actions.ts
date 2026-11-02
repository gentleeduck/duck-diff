import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'

// Deleting a branch from here deletes its comments too, so the question says how many.
export function deleteBranchNote(name: string, comments: number): string {
  const base = `Delete the branch ${name}? Its commits stay reachable only if another branch has them`
  if (!comments) return `${base}.`
  return `${base}, and ${comments === 1 ? 'its comment is' : `its ${comments} comments are`} deleted with it.`
}

export function useBranchComments(name: string): number {
  const { queries } = useApp()
  return useQuery(queries.git.reviewOverview()).data?.counts[name] ?? 0
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
