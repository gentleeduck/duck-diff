import { runGit } from './run'

export interface CheckoutInfo {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  head: { sha: string; subject: string; author: string; committedAt: number } | null
  // Files that differ from the commit, staged, unstaged or untracked.
  changes: number
}

// What a checkout's card says about it: its branch against its upstream, the commit it is on, and how many files
// differ from that commit. It reads any checkout by its folder, this repo's or another's.
export async function readCheckout(path: string): Promise<CheckoutInfo> {
  const [status, log] = await Promise.all([
    runGit(['status', '--porcelain=v2', '--branch'], { cwd: path }),
    // A repo with no commits yet has no HEAD to log.
    runGit(['log', '-1', '--format=%H%x00%s%x00%an%x00%ct'], { cwd: path }).catch(() => ''),
  ])
  const info: CheckoutInfo = { branch: null, upstream: null, ahead: 0, behind: 0, head: null, changes: 0 }
  for (const line of status.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice(14)
      info.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) info.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [ahead = '+0', behind = '-0'] = line.slice(12).split(' ')
      info.ahead = Number(ahead.slice(1))
      info.behind = Number(behind.slice(1))
    } else if (/^[12u?] /.test(line)) info.changes++
  }
  const [sha, subject = '', author = '', time = '0'] = log.trim().split('\0')
  if (sha) info.head = { sha, subject, author, committedAt: Number(time) }
  return info
}
