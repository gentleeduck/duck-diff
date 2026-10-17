import { describe, expect, it } from 'bun:test'
import { spawn } from 'node:child_process'
import { createSiblings, pageOpener } from '../siblings'

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

describe('sibling servers across a restart', () => {
  it('reuses one still running from before this server restarted instead of starting another', async () => {
    const started: string[] = []
    const siblings = createSiblings(
      async (path) => {
        started.push(path)
        return { url: 'http://127.0.0.1:9/?token=new', child: null }
      },
      async (path) => (path === '/kept' ? 'http://127.0.0.1:7/?token=kept' : null),
    )
    expect(await siblings.open('/kept')).toBe('http://127.0.0.1:7/?token=kept')
    expect(await siblings.open('/other')).toBe('http://127.0.0.1:9/?token=new')
    expect(started).toEqual(['/other'])
  })

  it('leaves them running when this server only hands over to a new build', async () => {
    const child = spawn('/bin/sh', ['-c', 'while :; do sleep 0.05; done'], { stdio: 'ignore' })
    const siblings = createSiblings(async () => ({ url: 'http://127.0.0.1:1/', child }))
    await siblings.open('/w')
    await siblings.stop({ keep: true })
    expect(child.exitCode).toBeNull()
    expect(child.signalCode).toBeNull()
    await siblings.stop()
    expect(child.signalCode ?? child.exitCode).not.toBeNull()
  })
})

describe('a sibling page', () => {
  it('opens through the Neovim plugin when one is attached, so its own open setting applies', async () => {
    const asked: string[][] = []
    const browsed: string[] = []
    const open = pageOpener('/tmp/nvim.sock', {
      evaluate: async (address, expr) => {
        asked.push([address, expr])
        return ''
      },
      browser: (url) => browsed.push(url) > 0,
    })
    expect(await open('http://127.0.0.1:2/?token=t')).toBe(true)
    expect(asked).toEqual([
      ['/tmp/nvim.sock', "luaeval('require(\"duck-diff.open\").page(_A)', 'http://127.0.0.1:2/?token=t')"],
    ])
    expect(browsed).toEqual([])
  })

  it('opens as the command line does without Neovim, or when the plugin cannot', async () => {
    const browsed: string[] = []
    const browser = (url: string) => browsed.push(url) > 0
    expect(await pageOpener(null, { browser })('http://a/')).toBe(true)
    const failing = pageOpener('/tmp/nvim.sock', {
      evaluate: async () => {
        throw new Error('nvim exited 1')
      },
      browser,
    })
    expect(await failing('http://b/')).toBe(true)
    expect(browsed).toEqual(['http://a/', 'http://b/'])
  })
})
