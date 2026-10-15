import { spawnSync } from 'node:child_process'
import { chmod, rename, rm, writeFile } from 'node:fs/promises'

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
  assets: { name: string; url: string }[]
}

async function github(path: string, auth: string | null, accept = 'application/vnd.github+json'): Promise<Response> {
  // Asset downloads come as full api urls; everything else is a path on the api.
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`
  const response = await fetch(url, {
    headers: { accept, 'user-agent': 'duck-diff', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
  })
  if (!response.ok) {
    const hint = response.status === 404 && !auth ? ' (a private repo needs GITHUB_TOKEN or gh auth login)' : ''
    throw new Error(`GitHub answered ${response.status} for ${path}${hint}`)
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

// Fetches the release for this machine, checks it against the release's checksums and puts it over the
// running binary in one rename, so a server watching its own file picks the new build up.
export async function update(binary: string, current: string, wanted: string | null): Promise<string> {
  const auth = token()
  const release = (await (
    await github(`/repos/${REPO}/releases/${wanted ? `tags/v${wanted}` : 'latest'}`, auth)
  ).json()) as Release
  const version = release.tag_name.replace(/^v/, '')
  if (version === current && !wanted) return `already on ${version}, the newest one`
  const name = assetName()
  const asset = release.assets.find((entry) => entry.name === name)
  const sums = release.assets.find((entry) => entry.name === 'checksums.txt')
  if (!asset || !sums) throw new Error(`release ${release.tag_name} has no ${name}`)
  const download = async (url: string) => github(url, auth, 'application/octet-stream')
  const expected = checksumFor(await (await download(sums.url)).text(), name)
  const bytes = new Uint8Array(await (await download(asset.url)).arrayBuffer())
  const actual = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
  if (!expected || expected !== actual) throw new Error(`the download does not match its checksum; nothing changed`)
  const next = `${binary}.update`
  try {
    await writeFile(next, bytes)
    await chmod(next, 0o755)
    await rename(next, binary)
  } catch (error) {
    await rm(next, { force: true })
    throw error
  }
  return `updated ${current} to ${version}`
}
