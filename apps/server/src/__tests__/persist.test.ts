import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

describe('a server that keeps its cache', () => {
  let repo: TestRepo
  let data: string
  let server: RunningServer | null = null
  afterEach(async () => {
    await server?.stop()
    repo.cleanup()
    rmSync(data, { recursive: true, force: true })
  })
  const start = async () => {
    server = await createServer({ repo: repo.path, port: testPort(), watch: false, persist: true, dataDir: data })
    return server
  }
  const get = (path: string) =>
    fetch(`http://127.0.0.1:${server?.port}${path}`, { headers: { 'x-duck-diff-token': server?.token ?? '' } })

  it('serves the graph and commits again after a restart and reads the graph anew once a ref moves', async () => {
    repo = createRepo()
    data = mkdtempSync(join(tmpdir(), 'duck-persist-'))
    repo.write('a.txt', '1\n')
    const sha = repo.commit('first')
    await start()
    const before = await (await get('/api/graph?limit=50')).text()
    expect(before).toContain('first')
    const commit = await (await get(`/api/commit?sha=${sha}`)).json()
    await server?.stop()

    server = null
    await start()
    expect(await (await get('/api/graph?limit=50')).text()).toBe(before)
    expect(await (await get(`/api/commit?sha=${sha}`)).json()).toEqual(commit)

    repo.write('a.txt', '2\n')
    repo.commit('second')
    expect(await (await get('/api/graph?limit=50')).text()).toContain('second')
  })
})
