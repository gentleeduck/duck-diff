#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { relative } from 'node:path'
import { duckHome, resolveRepo, runGit, snapshotCommit } from '@duck-diff/git'
import type { Handshake } from '@duck-diff/protocol'
import { type Command, parseArgs, VERSION } from './args'
import { startBanner } from './banner'
import { ansi, createReporter, header, paintFor } from './cli-ui'
import { clearCaches } from './disk-cache'
import { gitSetup, gitSetupOff } from './git-setup'
import { help } from './help'
import { alive, instanceFile, liveInstance, openBrowser, pageUrl, removeInstance, writeInstance } from './instance'
import { moveOldData } from './move-home'
import { buildStamp, watchBinary } from './self-update'
import { createServer } from './server'
import { ensureServer, runTool, ToolError } from './tool-cli'
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

// This binary as git should run it: by name when it is the duck-diff on the PATH, so an update never leaves git
// pointing at an old copy, by its full path otherwise (the Neovim plugin's own copy).
function selfCommand(): string {
  if (!binary) return 'duck-diff'
  const onPath = Bun.which('duck-diff')
  return onPath && realpathSync(onPath) === realpathSync(binary) ? 'duck-diff' : binary
}

async function setupGit(off: boolean, quiet: boolean): Promise<number> {
  const say = (line: string) => quiet || report.ok(line)
  try {
    if (off) {
      const changes = await gitSetupOff(duckHome())
      if (!quiet) showHeader()
      for (const change of changes) say(`Removed ${change.key} (was ${change.was})`)
      if (!changes.length) say("duck-diff was not set up as any of git's tools")
      return 0
    }
    const { changes, kept } = await gitSetup(selfCommand(), duckHome())
    if (!quiet) showHeader()
    for (const change of changes) say(`${change.key} = ${change.now}`)
    if (!quiet) {
      for (const { key, value } of kept)
        report.note(`Kept your ${key} (${value}); set it to duck-diff to use it there too.`)
      report.note(
        'git mergetool, git difftool and git rebase -i now open duck-diff; duck-diff git-setup --off undoes it.',
      )
    }
    return 0
  } catch (error) {
    fail(`could not set up git: ${(error as Error).message}`)
    return 1
  }
}

// git ran duck-diff as one of its tools: a window shows what git handed over, and the exit code tells git how
// it went (0 resolved or done, anything else not).
async function runGitTool(
  command: Extract<Command, { name: 'mergetool' | 'difftool' | 'rebase-todo' }>,
  repo: string,
  record: string,
): Promise<number> {
  const self = binary ? [binary] : [process.execPath, Bun.main]
  const say = (line: string) => console.error(line)
  if (command.name === 'mergetool') {
    const path = relative(repo, command.path)
    const unmerged = async () => (await runGit(['ls-files', '-u', '--', path], { cwd: repo })).trim() !== ''
    if (!(await unmerged())) return 0
    const instance = await ensureServer(record, repo, self)
    say(`Resolve ${path} in duck-diff; this waits until it is staged.`)
    const ok = await runTool(instance, {
      start: { kind: 'merge', path },
      page: '/merge',
      settled: async () => !(await unmerged()),
      say,
    })
    if (!ok) say(`${path} is still in conflict: the duck-diff window was closed.`)
    return ok ? 0 : 1
  }
  if (command.name === 'difftool') {
    const path = relative(repo, command.path)
    const [from, to] = await Promise.all([
      snapshotCommit(repo, path, command.left),
      snapshotCommit(repo, path, command.right),
    ])
    const instance = await ensureServer(record, repo, self)
    const ok = await runTool(instance, {
      start: { kind: 'diff', path, target: { kind: 'range', from, to, mode: 'two-dot' } },
      page: '/changes',
      say,
    })
    return ok ? 0 : 1
  }
  const instance = await ensureServer(record, repo, self)
  try {
    return (await runTool(instance, { start: { kind: 'rebase', todo: command.todo }, page: '/graph', say })) ? 0 : 1
  } catch (error) {
    // A todo with lines the planner does not handle goes to the editor the user has for everything else.
    if (!(error instanceof ToolError) || error.status !== 422) throw error
    const editor = (await runGit(['var', 'GIT_EDITOR'], { cwd: repo })).trim() || 'vi'
    const done = spawnSync('/bin/sh', ['-c', `${editor} "$1"`, 'editor', command.todo], { stdio: 'inherit' })
    return done.status ?? 1
  }
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

  // A home chosen by DUCK_DIFF_HOME (tests, a second profile) never takes the user's own data.
  if (!process.env.DUCK_DIFF_HOME) {
    try {
      moveOldData(duckHome())
    } catch (error) {
      // Not worth refusing to start over: what did not move is still where it was.
      console.warn(`could not move old data into ${duckHome()}: ${(error as Error).message}`)
    }
  }
  if (command.name === 'cache-clear') {
    showHeader()
    const cleared = await clearCaches(duckHome(), command.repo)
    report.ok(cleared ? `Cleared ${cleared} cache${cleared === 1 ? '' : 's'}` : 'Nothing was cached')
    if (cleared) report.note('GitHub answers and commits are read again the next time they are needed.')
    return 0
  }
  if (command.name === 'git-setup') return setupGit(command.off, command.quiet)
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
  const record = instanceFile(duckHome(), repo)

  if (command.name === 'mergetool' || command.name === 'difftool' || command.name === 'rebase-todo') {
    try {
      return await runGitTool(command, repo, record)
    } catch (error) {
      fail((error as Error).message)
      return 1
    }
  }

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
  // Started for another checkout by a server (siblings.ts): it lives as long as that one does.
  const parent = Number(process.env.DUCK_DIFF_PARENT) || 0
  delete process.env.DUCK_DIFF_PARENT
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
    if (parent) {
      // Its pid stays when it restarts in place for a new build; a pipe from it would close there.
      const check = setInterval(() => !alive(parent) && finish(0), 1000)
      check.unref()
    } else {
      // The plugin keeps stdin open; when the editor dies the pipe closes and the server follows.
      process.stdin.on('end', () => finish(0))
      process.stdin.resume()
    }
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
          const env = {
            ...process.env,
            DUCK_DIFF_PORT: String(server.port),
            DUCK_DIFF_TOKEN: server.token,
            ...(parent ? { DUCK_DIFF_PARENT: String(parent) } : {}),
          }
          void server.stop({ handOver: true }).then(() => execve(binary, [binary, ...process.argv.slice(2)], env))
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
