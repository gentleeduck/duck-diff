import { toast } from 'sonner'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'

// What can be done to a commit, shared by its panel and its right-click menu.
export function useCommitActions() {
  const { run } = useGit()
  const { navigate } = useTarget()
  const { show } = useView()
  const short = (sha: string) => sha.slice(0, 7)
  return {
    showChanges(sha: string, path?: string) {
      navigate(path ? { kind: 'commit', sha, path } : { kind: 'commit', sha })
      show('changes')
    },
    compareWithHead(sha: string) {
      navigate({ kind: 'range', from: sha, to: 'HEAD', mode: 'two-dot' })
      show('changes')
    },
    checkout: (sha: string) => run('checkout', { sha }, `Checked out ${short(sha)}`),
    cherryPick: (sha: string) => run('cherry-pick', { ref: sha }, `Cherry-picked ${short(sha)}`),
    revert: (sha: string) => run('revert', { ref: sha }, `Reverted ${short(sha)}`),
    createBranch: (name: string, sha: string) =>
      run('switch', { branch: name, create: true, start: sha }, `Created ${name} at ${short(sha)}`),
    async copy(text: string, what: string) {
      await navigator.clipboard.writeText(text)
      toast(`Copied the ${what}`)
    },
  }
}

// Branch names git would reject are caught by the server; this only blocks the obvious blanks.
export const usableBranchName = (name: string) => name.trim().length > 0 && !/\s/.test(name.trim())
