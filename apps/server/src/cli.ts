#!/usr/bin/env bun
import { resolveRepo, runGit } from '@duck-diff/git'
import type { Handshake } from '@duck-diff/protocol'
import { type Command, parseArgs, VERSION } from './args'
import { startBanner } from './banner'
import { ansi, createReporter, header, paintFor } from './cli-ui'
import { clearCaches, dataHome } from './disk-cache'
import { help } from './help'
import { instanceFile, liveInstance, openBrowser, pageUrl, removeInstance, writeInstance } from './instance'
import { buildStamp, watchBinary } from './self-update'
import { createServer } from './server'
import { update } from './update'

// A compiled server runs from its own binary; from source there is nothing to watch or replace.
const binary = Bun.main.includes('$bunfs') ? process.execPath : null

const color = paintFor(process.stdout)
const report = createReporter({ out: process.stdout, color, live: Boolean(process.stdout.isTTY) })
const showHeader = () => console.info(['', ...header(VERSION, color), ''].join('\n'))
// A red cross on a terminal; in a log, a line that says where it came from.
function fail(message: string) {
  console.error(
    process.stderr.isTTY ? `${ansi('31', paintFor(process.stderr))('✖')} ${message}` : `duck-diff: ${message}`,
  )
}

async function main(): Promise<number> {
  let command: Command
  try {
    command = parseArgs(process.argv.slice(2), process.cwd())
  } catch (error) {
    fail((error as Error).message)
    return 2
  }

  if (command.name === 'help') {
    console.info(help(command.topic))
    return 0
  }
  if (command.name === 'version') {
    console.info(VERSION)
    return 0
  }
  if (command.name === 'cache-clear') {
    showHeader()
    const cleared = await clearCaches(dataHome(), command.repo)
    report.ok(cleared ? `Cleared ${cleared} cache${cleared === 1 ? '' : 's'}` : 'Nothing was cached')
    if (cleared) report.note('GitHub answers and commits are read again the next time they are needed.')
    return 0
  }
  if (command.name === 'update') {
    showHeader()
    if (!binary) {
      report.fail('running from source; update the checkout with git instead')
      return 1
    }
    return (await update({ binary, current: VERSION, wanted: command.version, report })) ? 0 : 1
  }

  let repo: string
  try {
    repo = await resolveRepo(command.repo)
  } catch {
    fail(`${command.repo} is not a git repository, or inside one`)
    return 1
  }
  const record = instanceFile(dataHome(), repo)

  // One server per repo: a second `duck-diff` opens its page on the one already running.
  if (command.name === 'open') {
    const running = await liveInstance(record)
    if (running) {
      const url = pageUrl(running, command.path)
      // Without a browser to open, the link alone, for whoever runs this from a script.
      if (command.browser && openBrowser(url)) {
        showHeader()
        report.ok(`Opened in the duck-diff already running for ${repo}`)
      } else console.info(url)
      return 0
    }
  }

  let finish: (code: number) => void = () => {}
  const finished = new Promise<number>((resolve) => {
    finish = resolve
  })

  // Read once and cleared, so sibling servers and other children never inherit them.
  const takeover = { port: Number(process.env.DUCK_DIFF_PORT) || 0, token: process.env.DUCK_DIFF_TOKEN || undefined }
  delete process.env.DUCK_DIFF_PORT
  delete process.env.DUCK_DIFF_TOKEN
  const server = await createServer({
    repo,
    // After replacing itself the server comes back on the same port with the same token, so open pages
    // and Neovim keep talking to it.
    port: takeover.port || command.port,
    token: takeover.token,
    build: binary ? buildStamp(binary) : 'source',
    idleTimeoutMs: command.idleTimeoutMs,
    nvim: command.name === 'serve' ? command.nvim : null,
    terminal: command.terminal,
    persist: true,
    repos: command.name === 'serve' ? command.more : [],
    onIdle: () => finish(0),
  }).catch((error: Error) => {
    fail(error.message)
    return null
  })
  if (!server) return 1
  await writeInstance(record, { pid: process.pid, port: server.port, token: server.token }).catch(() => {})

  if (command.name === 'serve') {
    const handshake: Handshake = { port: server.port, token: server.token, url: server.url }
    process.stdout.write(`${JSON.stringify(handshake)}\n`)
    // The plugin keeps stdin open; when the editor dies the pipe closes and the server follows.
    process.stdin.on('end', () => finish(0))
    process.stdin.resume()
  } else if (!takeover.port) {
    const url = pageUrl(server, command.path)
    const branch = (
      await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd: repo, okExitCodes: [128] }).catch(() => '')
    ).trim()
    console.info(startBanner({ version: VERSION, repo, branch: branch || null, url }))
    if (command.browser && !openBrowser(url)) report.note('No browser to open; use the link above.')
  }

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

  const code = await finished
  stopWatching()
  await removeInstance(record, process.pid).catch(() => {})
  await server.stop()
  return code
}

process.exit(await main())
