import type { Job, ServerEvent } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'

export interface JobsState {
  // Newest first.
  jobs: Job[]
  running: number
}

export interface Jobs extends Store<JobsState> {
  load(): Promise<void>
  apply(event: ServerEvent): void
  // Hands over everything the job printed so far, then each chunk as it arrives, until stopped.
  follow(id: string, onData: (data: string) => void): () => void
  // Empties the list here and on the server, keeping a job still running.
  clear(): Promise<void>
}

const KEEP = 50

export function createJobs(api: Pick<Api, 'jobs' | 'jobOutput' | 'clearJobs'>): Jobs {
  const store = createStore<JobsState>({ jobs: [], running: 0 })
  // Output of the jobs this page saw start; older ones are read from the server when opened.
  const outputs = new Map<string, string>()
  const followers = new Map<string, Set<(data: string) => void>>()

  const put = (jobs: Job[]) =>
    store.set({ jobs: jobs.slice(0, KEEP), running: jobs.filter((job) => job.status === 'running').length })

  return {
    ...store,
    async load() {
      const read = await api.jobs()
      // Merged by id against the list as it is when the answer lands: another load or a live event may
      // have added the same jobs meanwhile.
      const byId = new Map(read.map((job) => [job.id, job]))
      for (const job of store.get().jobs) byId.set(job.id, job)
      put([...byId.values()].sort((a, b) => b.startedAt - a.startedAt))
    },
    apply(event) {
      if (event.type === 'job') {
        const { jobs } = store.get()
        const at = jobs.findIndex((job) => job.id === event.job.id)
        if (at === -1) {
          outputs.set(event.job.id, '')
          put([event.job, ...jobs])
        } else put(jobs.map((job) => (job.id === event.job.id ? event.job : job)))
        for (const id of outputs.keys()) if (!store.get().jobs.some((job) => job.id === id)) outputs.delete(id)
        return
      }
      if (event.type !== 'job-output') return
      const before = outputs.get(event.id)
      if (before !== undefined) outputs.set(event.id, before + event.data)
      for (const listener of followers.get(event.id) ?? []) listener(event.data)
    },
    async clear() {
      await api.clearJobs()
      put(store.get().jobs.filter((job) => job.status === 'running'))
    },
    follow(id, onData) {
      let stopped = false
      const listeners = followers.get(id) ?? new Set()
      followers.set(id, listeners)
      const known = outputs.get(id)
      if (known !== undefined) {
        if (known) onData(known)
        listeners.add(onData)
      } else {
        api.jobOutput(id).then(
          (text) => {
            if (stopped) return
            if (text) onData(text)
            listeners.add(onData)
          },
          () => {},
        )
      }
      return () => {
        stopped = true
        listeners.delete(onData)
      }
    },
  }
}
