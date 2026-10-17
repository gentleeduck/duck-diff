import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTerminals, type TerminalPeer, type Terminals } from '../pty'
import { type Fixture, startFixture } from './helpers'

const decoder = new TextDecoder()

function peer() {
  let text = ''
  const control: unknown[] = []
  const socket: TerminalPeer = {
    output: (data) => {
      text += decoder.decode(data)
    },
    control: (message) => control.push(message),
  }
  return { socket, text: () => Bun.stripANSI(text), control }
}

const until = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(10)
  }
}

describe('terminals', () => {
  let terminals: Terminals
  let dir: string
  afterEach(() => {
    terminals.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  const make = (options: Partial<Parameters<typeof createTerminals>[0]> = {}) => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'duck-pty-')))
    terminals = createTerminals({ cwd: dir, shell: '/bin/sh', args: [], flushMs: 2, ...options })
    return terminals
  }

  it('runs a shell in the repo with a real tty and echoes what it is sent', async () => {
    const { socket, text } = peer()
    const session = make().open({ cols: 90, rows: 20 })
    session.attach(socket)
    session.input('echo "tty=$(tty | cut -c1-8) cwd=$PWD"; echo $TERM\n')
    await until(() => text().includes('xterm-256color'))
    // Linux names ptys /dev/pts/N, macOS /dev/ttysNNN.
    expect(text()).toMatch(/tty=\/dev\/(pts|tty)/)
    expect(text()).toContain(`cwd=${dir}`)
  })

  // bash takes its terminal on its own; zsh, a common login shell, has to be handed it.
  for (const shell of ['bash', 'zsh'].filter((name) => Bun.which(name))) {
    it(`interrupts a running command with Ctrl+C and suspends one with Ctrl+Z in ${shell}, as any terminal does`, async () => {
      const { socket, text } = peer()
      // -f: zsh without the user's startup files, which would also set its history file back to theirs.
      const session = make({ shell, args: shell === 'zsh' ? ['-f'] : [] }).open({ cols: 90, rows: 20 })
      session.attach(socket)
      session.input('sleep 30; echo NOT-INTERRUPTED\n')
      await Bun.sleep(400)
      session.input('\x03')
      session.input('echo "after=$?"\n')
      await until(() => text().includes('after=130'))
      session.input('sleep 30\n')
      await Bun.sleep(400)
      session.input('\x1a')
      session.input('jobs\n')
      await until(() => /Stopped|suspended/.test(text()))
      expect(text()).not.toContain('no job control')
    })
  }

  it('ends what runs in a terminal when the terminal closes', async () => {
    const { socket, text } = peer()
    const session = make({ shell: 'bash' }).open({ cols: 90, rows: 20 })
    session.attach(socket)
    session.input('sleep 300 & echo "pid=$!"\n')
    await until(() => /pid=\d+/.test(text()))
    const pid = Number(/pid=(\d+)/.exec(text())?.[1])
    session.close()
    // Gone, or a zombie its new parent has not collected yet: either way it no longer runs.
    const running = () =>
      /^[^Z]/.test(
        Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pid)])
          .stdout.toString()
          .trim(),
      )
    await until(() => !running())
  })

  it('passes a resize through to programs that ask the size', async () => {
    const { socket, text } = peer()
    const session = make().open({ cols: 80, rows: 24 })
    session.attach(socket)
    session.resize(123, 31)
    session.input('stty size\n')
    await until(() => text().includes('31 123'))
  })

  it('replays what was printed to a page that attaches later', async () => {
    const first = peer()
    const session = make().open({ cols: 80, rows: 24 })
    session.attach(first.socket)
    // Computed by the shell, so the echo of the typed line never matches.
    session.input('echo before-$((40+2))\n')
    await until(() => first.text().includes('before-42'))
    session.detach(first.socket)
    const second = peer()
    terminals.get(session.id)?.attach(second.socket)
    expect(second.text()).toContain('before-42')
  })

  it('tells the page and forgets the terminal when the shell exits', async () => {
    const { socket, control } = peer()
    const session = make().open({ cols: 80, rows: 24 })
    session.attach(socket)
    session.input('exit 3\n')
    await until(() => control.some((message) => (message as { type: string }).type === 'exit'))
    expect(control).toContainEqual({ type: 'exit', code: 3 })
    expect(terminals.list()).toEqual([])
  })

  it('closes a terminal no page has looked at for a while', async () => {
    const session = make({ idleMs: 50 }).open({ cols: 80, rows: 24 })
    expect(terminals.list().map((entry) => entry.id)).toEqual([session.id])
    await until(() => terminals.list().length === 0)
  })

  it('keeps only the tail of a long scrollback', async () => {
    const { socket, text } = peer()
    const session = make({ scrollback: 4096 }).open({ cols: 80, rows: 24 })
    session.attach(socket)
    session.input('i=0; while [ $i -lt 2000 ]; do echo line-$i; i=$((i+1)); done; echo finished-$((1+1))\n')
    await until(() => text().includes('finished-2'))
    const later = peer()
    session.attach(later.socket)
    expect(later.text().length).toBeLessThanOrEqual(4096)
    expect(later.text()).toContain('finished-2')
    expect(later.text()).not.toContain('line-5\r\n')
  })
})

describe('terminal socket', () => {
  let fixture: Fixture
  afterEach(() => fixture.close())

  it('opens a shell over the socket, survives a reconnect and refuses other origins', async () => {
    fixture = await startFixture(() => {})
    const base = `127.0.0.1:${fixture.server.port}`
    const token = fixture.server.token
    const connect = (query: string) => {
      const socket = new WebSocket(`ws://${base}/api/pty?${query}&token=${token}`)
      socket.binaryType = 'arraybuffer'
      let text = ''
      let id = ''
      socket.onmessage = (message) => {
        if (typeof message.data === 'string') id = (JSON.parse(message.data) as { id?: string }).id ?? id
        else text += decoder.decode(new Uint8Array(message.data as ArrayBuffer))
      }
      return { socket, text: () => text, id: () => id }
    }
    const first = connect('cols=80&rows=24')
    await until(() => first.id() !== '')
    first.socket.send(JSON.stringify({ type: 'input', data: 'echo sock-$((40+2))\n' }))
    await until(() => first.text().includes('sock-42'))
    first.socket.close()
    const list = (await (await fixture.get('/api/terminals')).json()) as { id: string }[]
    expect(list.map((entry) => entry.id)).toEqual([first.id()])

    const again = connect(`id=${first.id()}`)
    await until(() => again.text().includes('sock-42'))
    again.socket.close()

    const evil = await fetch(`http://${base}/api/pty?token=${token}`, {
      headers: { origin: 'http://evil.example', upgrade: 'websocket', connection: 'Upgrade' },
    })
    expect(evil.status).toBe(403)
  })
})
