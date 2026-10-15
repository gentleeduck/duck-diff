import type { Job } from '@duck-diff/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createJobs } from '../jobs'

const job = (id: string, status: Job['status'] = 'running'): Job => ({
  id,
  title: 'Commit',
  command: 'git commit --file=-',
  startedAt: 1,
  endedAt: status === 'running' ? null : 2,
  status,
  error: null,
})

describe('jobs store', () => {
  it('keeps jobs newest first and follows a live job from its first byte', () => {
    const jobs = createJobs({ jobs: async () => [], jobOutput: async () => '' })
    jobs.apply({ type: 'job', job: job('a') })
    jobs.apply({ type: 'job-output', id: 'a', data: 'one ' })
    const seen: string[] = []
    const stop = jobs.follow('a', (data) => seen.push(data))
    jobs.apply({ type: 'job-output', id: 'a', data: 'two' })
    jobs.apply({ type: 'job', job: job('b') })
    jobs.apply({ type: 'job', job: job('a', 'ok') })
    stop()
    jobs.apply({ type: 'job-output', id: 'a', data: 'late' })
    expect(seen).toEqual(['one ', 'two'])
    expect(jobs.get().jobs.map((entry) => `${entry.id}:${entry.status}`)).toEqual(['b:running', 'a:ok'])
  })

  it('reads the output of a job that ran before the page opened', async () => {
    const jobOutput = vi.fn(async () => 'earlier')
    const jobs = createJobs({ jobs: async () => [job('old', 'ok')], jobOutput })
    await jobs.load()
    const seen: string[] = []
    jobs.follow('old', (data) => seen.push(data))
    await vi.waitFor(() => expect(seen).toEqual(['earlier']))
    expect(jobOutput).toHaveBeenCalledWith('old')
  })

  it('counts the jobs still running', () => {
    const jobs = createJobs({ jobs: async () => [], jobOutput: async () => '' })
    jobs.apply({ type: 'job', job: job('a') })
    jobs.apply({ type: 'job', job: job('b', 'failed') })
    expect(jobs.get().running).toBe(1)
  })
})

describe('jobs store, loading twice at once', () => {
  it('lists each job once when two loads race, or an event came in between', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const jobs = createJobs({
      jobs: async () => {
        await gate
        return [job('a', 'ok'), job('b', 'ok')]
      },
      jobOutput: async () => '',
    })
    const first = jobs.load()
    const second = jobs.load()
    jobs.apply({ type: 'job', job: job('a', 'ok') })
    release()
    await Promise.all([first, second])
    expect(
      jobs
        .get()
        .jobs.map((entry) => entry.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})
