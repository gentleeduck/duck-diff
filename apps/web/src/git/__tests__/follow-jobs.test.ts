import type { Job } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { createJobs } from '../../panel/jobs'
import { followJobs } from '../follow-jobs'

const job = (id: string, status: Job['status'], action = 'push'): Job => ({
  id,
  title: 'Push',
  command: 'git push',
  startedAt: 1,
  endedAt: status === 'running' ? null : 2,
  status,
  error: status === 'failed' ? 'Stopped when duck-diff restarted' : null,
  action,
})

const api = (list: Job[]) => ({ jobs: async () => list, jobOutput: async () => '', clearJobs: async () => {} })

describe('followJobs', () => {
  it('reports a job this page did not start, once, when it ends', async () => {
    const jobs = createJobs(api([job('a', 'running')]))
    await jobs.load()
    const ended: Job[] = []
    followJobs(
      jobs,
      () => true,
      () => null,
      (done) => ended.push(done),
    )
    jobs.apply({ type: 'job', job: job('a', 'ok') })
    jobs.apply({ type: 'job', job: job('a', 'ok') })
    expect(ended.map((done) => [done.id, done.status])).toEqual([['a', 'ok']])
  })

  it('leaves its own jobs and ones already over alone', () => {
    const jobs = createJobs(api([]))
    const ended: Job[] = []
    followJobs(
      jobs,
      () => true,
      () => 'push',
      (done) => ended.push(done),
    )
    jobs.apply({ type: 'job', job: job('mine', 'running') })
    jobs.apply({ type: 'job', job: job('mine', 'ok') })
    jobs.apply({ type: 'job', job: job('old', 'failed', 'fetch') })
    expect(ended).toEqual([])
  })

  it('hears of the end from a reload too, when the live event was missed', async () => {
    let list = [job('a', 'running')]
    const jobs = createJobs({ ...api([]), jobs: async () => list })
    await jobs.load()
    const ended: Job[] = []
    followJobs(
      jobs,
      () => true,
      () => null,
      (done) => ended.push(done),
    )
    list = [job('a', 'failed')]
    await jobs.load()
    expect(ended.map((done) => done.error)).toEqual(['Stopped when duck-diff restarted'])
  })
})
