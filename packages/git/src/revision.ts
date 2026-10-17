import type { ResolvedRevision } from '@duck-diff/protocol'
import { runGit } from './run'

const short = (sha: string) => sha.slice(0, 7)
const unknown = (reason: string): ResolvedRevision => ({ kind: 'unknown', reason })
// A ref a diff target can carry: what the picker sends back must pass the same check.
const asRef = (text: string) => !/[\s\0]/.test(text) && !text.startsWith('-') && text.length <= 256

async function verify(repo: string, rev: string): Promise<string> {
  const out = await runGit(['rev-parse', '--verify', '--quiet', '--end-of-options', rev], {
    cwd: repo,
    okExitCodes: [1, 128],
  })
  return out.trim()
}

async function commit(repo: string, text: string): Promise<ResolvedRevision> {
  // ^abc on its own excludes abc, which is no commit; as a side of a diff it reads as the commit before abc.
  if (text.startsWith('^') && text.length > 1) {
    const after = await commit(repo, text.slice(1))
    if (after.kind !== 'commit') return after
    const before = await verify(repo, `${after.sha}^`)
    if (!before) return unknown(`${short(after.sha)} is the first commit; nothing comes before it`)
    const subject = await runGit(['log', '-1', '--format=%s', before], { cwd: repo })
    return {
      kind: 'commit',
      ref: `${after.ref}^`,
      sha: before,
      subject: subject.trim(),
      note: `before ${short(after.sha)}`,
    }
  }
  if (text.startsWith('-')) return unknown(`${text} is not a revision`)
  // A :/message search takes everything after it as the text, so it gets no ^{commit} of its own.
  const sha = await verify(repo, text.startsWith(':/') ? text : `${text}^{commit}`)
  if (!sha) {
    if (!/^[0-9a-f]{4,40}$/i.test(text)) return unknown(`git knows no commit called ${text} here`)
    const matches = await runGit(['rev-parse', `--disambiguate=${text}`], { cwd: repo, okExitCodes: [128] })
    const count = matches.split('\n').filter(Boolean).length
    return unknown(
      count > 1 ? `${text} is ambiguous: ${count} objects start with it` : `no commit starts with ${text} here`,
    )
  }
  const subject = await runGit(['log', '-1', '--format=%s', sha], { cwd: repo })
  return { kind: 'commit', ref: asRef(text) ? text : sha, sha, subject: subject.trim(), note: null }
}

// Whatever git reads as a commit (a hash, a name, HEAD~2, ^abc, :/message, main@{yesterday}) or a range of two,
// with the reason when it is neither.
export async function resolveRevision(repo: string, text: string): Promise<ResolvedRevision> {
  const range = text.startsWith(':/') ? null : /^(.+?)(\.{3}|\.{2})(.+)$/.exec(text)
  if (range) {
    const [, left = '', dots, right = ''] = range
    const from = await commit(repo, left)
    if (from.kind !== 'commit') return from
    const to = await commit(repo, right)
    if (to.kind !== 'commit') return to
    return { kind: 'range', from, to, mode: dots === '...' ? 'merge-base' : 'two-dot' }
  }
  return commit(repo, text)
}
