import { memo, useCallback, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { TerminalSurface } from './TerminalSurface'
import type { TerminalTab } from './tabs'
import type { Terminal } from './xterm'

const readControl = (data: unknown) => data as { type?: string; id?: string; title?: string; code?: number }

function socketUrl(query: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/pty?${query}`
}

// One shell on the server. A dropped socket (a reload, a new build taking over) reconnects to the same
// shell, which replays what it printed meanwhile.
export const TerminalPane = memo(function TerminalPane({ tab, active }: { tab: TerminalTab; active: boolean }) {
  const { terminalTabs } = useApp()
  const { key } = tab
  // The id is read once: learning it later must not rebuild the terminal.
  const [startId] = useState(tab.id)

  const attach = useCallback(
    (terminal: Terminal) => {
      let id = startId
      let socket: WebSocket | null = null
      let stopped = false
      let retry: ReturnType<typeof setTimeout> | null = null
      let delay = 300
      const send = (message: unknown) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message))

      const connect = () => {
        const query = id ? `id=${encodeURIComponent(id)}` : `cols=${terminal.cols}&rows=${terminal.rows}`
        const current = new WebSocket(socketUrl(query))
        current.binaryType = 'arraybuffer'
        socket = current
        let reattached = false
        current.onmessage = (message) => {
          if (typeof message.data !== 'string') {
            terminal.write(new Uint8Array(message.data as ArrayBuffer))
            return
          }
          const control = readControl(JSON.parse(message.data))
          if (control.type === 'ready' && control.id) {
            delay = 300
            // A reattached shell replays its scrollback, so the screen starts clean.
            if (id && !reattached) terminal.reset()
            reattached = true
            id = control.id
            terminalTabs.setId(key, control.id)
            send({ type: 'resize', cols: terminal.cols, rows: terminal.rows })
          } else if (control.type === 'exit') {
            stopped = true
            terminalTabs.remove(key)
          }
        }
        current.onclose = (event) => {
          if (stopped || socket !== current) return
          // The shell is gone (the server restarted without it): the tab goes too.
          if (event.code === 4404 || (!reattached && id)) {
            terminalTabs.remove(key)
            return
          }
          retry = setTimeout(connect, delay)
          delay = Math.min(delay * 2, 5000)
        }
      }

      const typing = terminal.onData((data) => send({ type: 'input', data }))
      const resizing = terminal.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }))
      const naming = terminal.onTitleChange((title) => title && terminalTabs.rename(key, title))
      connect()
      return () => {
        stopped = true
        if (retry) clearTimeout(retry)
        typing.dispose()
        resizing.dispose()
        naming.dispose()
        socket?.close()
      }
    },
    [terminalTabs, key, startId],
  )

  return (
    <div className={active ? 'h-full' : 'hidden'}>
      <TerminalSurface label={tab.name} attach={attach} autoFocus={active} />
    </div>
  )
})
