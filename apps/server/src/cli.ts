#!/usr/bin/env bun
import type { Handshake } from '@duck-diff/protocol'
import { type Command, parseArgs, USAGE, VERSION } from './args'
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

  let finish: (code: number) => void = () => {}
  const finished = new Promise<number>((resolve) => {
    finish = resolve
  })

  const server = await createServer({
    repo: command.repo,
    port: command.port,
    idleTimeoutMs: command.idleTimeoutMs,
    nvim: command.nvim,
    onIdle: () => finish(0),
  }).catch((error: Error) => {
    console.error(error.message)
    return null
  })
  if (!server) return 1

  const handshake: Handshake = { port: server.port, token: server.token, url: server.url }
  process.stdout.write(`${JSON.stringify(handshake)}\n`)

  process.on('SIGINT', () => finish(0))
  process.on('SIGTERM', () => finish(0))
  // The plugin keeps stdin open; when Neovim dies the pipe closes and the server follows.
  process.stdin.on('end', () => finish(0))
  process.stdin.resume()

  const code = await finished
  await server.stop()
  return code
}

process.exit(await main())
