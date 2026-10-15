#!/usr/bin/env bun
import type { Handshake } from '@duck-diff/protocol'
import { type Command, parseArgs, USAGE, VERSION } from './args'
import { clearCaches, dataHome } from './disk-cache'
import { buildStamp, watchBinary } from './self-update'
import { createServer } from './server'

async function main(): Promise<number> {
  let command: Command
  try {
    command = parseArgs(process.argv.slice(2), process.cwd())
  } catch (error) {
    console.error((error as Error).message)
    return 2
  }

  if (command.name === 'help') {
    console.info(USAGE)
    return 0
  }
  if (command.name === 'version') {
    console.info(VERSION)
    return 0
  }
  if (command.name === 'cache-clear') {
    const cleared = await clearCaches(dataHome(), command.repo)
    console.info(`Cleared ${cleared} cache${cleared === 1 ? '' : 's'}`)
    return 0
  }

  let finish: (code: number) => void = () => {}
  const finished = new Promise<number>((resolve) => {
    finish = resolve
  })

  // Read once and cleared, so sibling servers and other children never inherit them.
  const takeover = { port: Number(process.env.DUCK_DIFF_PORT) || 0, token: process.env.DUCK_DIFF_TOKEN || undefined }
  delete process.env.DUCK_DIFF_PORT
  delete process.env.DUCK_DIFF_TOKEN
  // A compiled server runs from its own binary; from source there is nothing to watch.
  const binary = Bun.main.includes('$bunfs') ? process.execPath : null
  const server = await createServer({
    repo: command.repo,
    // After replacing itself the server comes back on the same port with the same token, so open pages
    // and Neovim keep talking to it.
    port: takeover.port || command.port,
    token: takeover.token,
    build: binary ? buildStamp(binary) : 'source',
    idleTimeoutMs: command.idleTimeoutMs,
    nvim: command.nvim,
    terminal: command.terminal,
    persist: true,
    repos: command.more,
    onIdle: () => finish(0),
  }).catch((error: Error) => {
    console.error(error.message)
    return null
  })
  if (!server) return 1

  const handshake: Handshake = { port: server.port, token: server.token, url: server.url }
  process.stdout.write(`${JSON.stringify(handshake)}\n`)

  // A new build installed over this binary takes over in place: same process, so Neovim's pipe and the
  // plugin's handle stay, and pages reconnect and reload.
  const execve = process.execve
  const stopWatching =
    binary && execve
      ? watchBinary(binary, () => {
          const env = { ...process.env, DUCK_DIFF_PORT: String(server.port), DUCK_DIFF_TOKEN: server.token }
          void server.stop().then(() => execve(binary, [binary, ...process.argv.slice(2)], env))
        })
      : () => {}

  process.on('SIGINT', () => finish(0))
  process.on('SIGTERM', () => finish(0))
  // The plugin keeps stdin open; when Neovim dies the pipe closes and the server follows.
  process.stdin.on('end', () => finish(0))
  process.stdin.resume()

  const code = await finished
  stopWatching()
  await server.stop()
  return code
}

process.exit(await main())
