import type { Job } from '@duck-diff/protocol'
import type { Store } from '../lib/store'
import type { JobsState } from '../panel/jobs'

// Calls back once for each job seen running that this page did not start, when it ends: one started before a
// reload, from another tab, or cut off by a restart.
export function followJobs(
  jobs: Store<JobsState>,
  follows: (job: Job) => boolean,
  mine: () => string | null,
  onEnd: (job: Job) => void,
): () => void {
  const watched = new Set<string>()
  const check = () => {
    for (const job of jobs.get().jobs) {
      if (!follows(job)) continue
      if (job.status === 'running') {
        if (job.action !== mine()) watched.add(job.id)
      } else if (watched.delete(job.id)) onEnd(job)
    }
  }
  check()
  return jobs.subscribe(check)
}
