import { spawnSync } from 'node:child_process'
import { chmod, rename, rm, writeFile } from 'node:fs/promises'
import { formatBytes, type Reporter, type Step } from './cli-ui'

const REPO = process.env.DUCK_DIFF_REPO ?? 'gentleeduck/duck-diff'
const OS: Record<string, string> = { linux: 'linux', darwin: 'darwin' }
const ARCH: Record<string, string> = { x64: 'x64', arm64: 'arm64' }

// The release asset for this machine, named as the release workflow builds them.
export function assetName(platform = process.platform, arch = process.arch): string {
  const os = OS[platform]
  const cpu = ARCH[arch]
  if (!os || !cpu) throw new Error(`no duck-diff build for ${platform} ${arch} (yet)`)
  return `duck-diff-${os}-${cpu}`
}

// A private repo serves its releases only to a token; a public one needs none.
function token(): string | null {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (fromEnv) return fromEnv
  const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' })
  return gh.status === 0 && gh.stdout.trim() ? gh.stdout.trim() : null
}

interface Release {
  tag_name: string
  assets: { name: string; url: string; size?: number }[]
}

const PRIVATE_HINT = ' (a private repo needs GITHUB_TOKEN or gh auth login)'

async function github(
  api: string,
  path: string,
  auth: string | null,
  accept = 'application/vnd.github+json',
): Promise<Response> {
  // Asset downloads come as full api urls; everything else is a path on the api.
  const url = path.startsWith('http') ? path : `${api}${path}`
  const response = await fetch(url, {
    headers: { accept, 'user-agent': 'duck-diff', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
  })
  if (!response.ok) {
    const hint = response.status === 404 && !auth ? PRIVATE_HINT : ''
    throw Object.assign(new Error(`GitHub answered ${response.status} for ${path}${hint}`), { status: response.status })
  }
  return response
}

export function checksumFor(checksums: string, name: string): string | null {
  for (const line of checksums.split('\n')) {
    const [sum, file] = line.trim().split(/\s+/)
    if (file?.replace(/^\*/, '') === name && sum) return sum.toLowerCase()
  }
  return null
}

// The body, reported as it arrives so a large download shows how far along it is.
async function readBody(response: Response, size: number | null, step: Step): Promise<Uint8Array> {
  // The release says the file's size; content-length may be the compressed one, or missing.
  const total = size || Number(response.headers.get('content-length')) || null
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer())
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    step.progress(received, total)
  }
  const bytes = new Uint8Array(received)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

// Apple Silicon kills code whose signature does not check out, so a build that does not verify is signed ad hoc.
function signForMac(path: string) {
  if (process.platform !== 'darwin') return
  spawnSync('xattr', ['-d', 'com.apple.quarantine', path])
  if (spawnSync('codesign', ['--verify', '--strict', path]).status === 0) return
  if (spawnSync('codesign', ['--force', '--sign', '-', path]).status !== 0) {
    throw new Error('could not sign the new binary for macOS; nothing changed')
  }
}

export interface UpdateOptions {
  binary: string
  current: string
  // A release other than the latest.
  wanted: string | null
  report: Reporter
  // Another API, repo or token, for tests; the token is looked up when left out.
  api?: string
  repo?: string
  auth?: string | null
}

// Fetches the release for this machine, checks it against the release's checksums and puts it over the
// running binary in one rename, so a server watching its own file picks the new build up. Each step is
// reported as it happens; false means one failed and the binary is as it was.
export async function update(options: UpdateOptions): Promise<boolean> {
  const { binary, current, wanted, report } = options
  const api = options.api ?? 'https://api.github.com'
  const repo = options.repo ?? REPO
  let step: Step | null = null
  try {
    const auth = options.auth === undefined ? token() : options.auth
    step = report.step(wanted ? `Finding release ${wanted}` : 'Finding the latest release')
    const path = `/repos/${repo}/releases/${wanted ? `tags/v${wanted}` : 'latest'}`
    const found = await github(api, path, auth).catch((error: Error & { status?: number }) => {
      if (!wanted || error.status !== 404) throw error
      // GitHub answers 404 for a repo the token cannot read, too.
      throw new Error(
        `there is no release ${wanted}${auth ? ' that this token can read' : ''}; see https://github.com/${repo}/releases${auth ? '' : PRIVATE_HINT}`,
      )
    })
    const release = (await found.json()) as Release
    const version = release.tag_name.replace(/^v/, '')
    if (version === current && !wanted) {
      step.done(`Already on ${current}, the newest release`)
      return true
    }
    const name = assetName()
    const asset = release.assets.find((entry) => entry.name === name)
    const sums = release.assets.find((entry) => entry.name === 'checksums.txt')
    if (!asset || !sums) throw new Error(`release ${release.tag_name} has no ${name}`)
    const same = version === current
    step.done(
      same ? `Found ${version}, the one you have; installing it again` : `Found ${version} (you have ${current})`,
    )

    step = report.step(`Downloading ${name}`)
    const download = (url: string) => github(api, url, auth, 'application/octet-stream')
    const expected = checksumFor(await (await download(sums.url)).text(), name)
    const bytes = await readBody(await download(asset.url), asset.size ?? null, step)
    step.done(`Downloaded ${formatBytes(bytes.length)}`)

    step = report.step('Checking the sha256')
    const actual = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
    if (!expected || expected !== actual) throw new Error('the download does not match its checksum; nothing changed')
    step.done('The sha256 matches')

    step = report.step(`Installing ${binary}`)
    const next = `${binary}.update`
    try {
      await writeFile(next, bytes)
      await chmod(next, 0o755)
      signForMac(next)
      await rename(next, binary)
    } catch (error) {
      await rm(next, { force: true })
      throw error
    }
    step.done(`Installed ${binary}`)
    step = null
    report.blank()
    const done = same
      ? `Reinstalled ${version}.`
      : wanted
        ? `Switched from ${current} to ${version}.`
        : `Updated ${current} to ${version}.`
    report.note(`${done} Servers already running switch to it on their own.`)
    return true
  } catch (error) {
    const message = (error as Error).message
    if (step) step.fail(message)
    else report.fail(message)
    return false
  }
}
