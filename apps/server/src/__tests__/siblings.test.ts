import { describe, expect, it } from 'bun:test'
import { spawn } from 'node:child_process'
import { createSiblings } from '../siblings'

describe('sibling servers', () => {
  it('stops each one and waits until it has exited', async () => {
    // Stands in for a server that takes a moment to save its state after SIGTERM.
    const child = spawn('/bin/sh', ['-c', 'trap "sleep 0.3; exit 0" TERM; while :; do sleep 0.05; done'], {
      stdio: 'ignore',
    })
    await Bun.sleep(100)
    const siblings = createSiblings(async () => ({ url: 'http://127.0.0.1:1/', child }))
    expect(await siblings.open('/other')).toBe('http://127.0.0.1:1/')
    await siblings.stop()
    expect(child.exitCode).toBe(0)
  })
})
