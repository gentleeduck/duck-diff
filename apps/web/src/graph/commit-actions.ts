import { toast } from 'sonner'
import { ask } from '../app/Ask'
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
    async reset(sha: string, mode: 'soft' | 'mixed' | 'hard') {
      if (mode === 'hard') {
        const yes = await ask.confirm({
          title: `Hard reset to ${short(sha)}`,
          body: 'Moves the branch here and throws away every uncommitted change. This cannot be undone.',
          action: 'Reset and discard',
          destructive: true,
        })
        if (!yes) return false
      }
      return run('reset', { sha, mode }, `Reset to ${short(sha)} (${mode})`)
    },
    async tag(sha: string) {
      const values = await ask.prompt({
        title: `Tag ${short(sha)}`,
        fields: [
          { name: 'name', label: 'Tag name', placeholder: 'v1.2.0' },
          { name: 'message', label: 'Message (makes an annotated tag)', multiline: true, optional: true },
        ],
        action: 'Create tag',
      })
      if (!values) return false
      return run('tag-create', { name: values.name, sha, message: values.message ?? '' }, `Tagged ${values.name}`)
    },
    fixup: (sha: string) => run('fixup', { sha }, `Folded the staged changes into ${short(sha)}`),
    bisect: (kind: 'good' | 'bad' | 'skip', sha?: string) =>
      run('bisect-mark', sha ? { kind, sha } : { kind }, sha ? `Marked ${short(sha)} ${kind}` : `Marked ${kind}`),
    cherryPickRange: (shas: string[]) => run('cherry-pick-range', { shas }, `Cherry-picked ${shas.length} commits`),
    async copy(text: string, what: string) {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied the ${what}`, { description: text })
    },
  }
}

// Branch names git would reject are caught by the server; this only blocks the obvious blanks.
export const usableBranchName = (name: string) => name.trim().length > 0 && !/\s/.test(name.trim())
