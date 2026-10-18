import { rmSync } from 'node:fs'
import { join } from 'node:path'

const TARGETS = ['bun-linux-x64', 'bun-linux-arm64', 'bun-darwin-arm64', 'bun-darwin-x64'] as const
type Target = (typeof TARGETS)[number]

const root = join(import.meta.dir, '..')
const flag = process.argv.indexOf('--target')
const target = flag === -1 ? undefined : (process.argv[flag + 1] as Target | undefined)
if (target && !TARGETS.includes(target)) {
  console.error(`unknown target ${target}; expected one of ${TARGETS.join(', ')}`)
  process.exit(2)
}

const name = target ? `duck-diff-${target.replace('bun-', '')}` : 'duck-diff'
const outfile = join(root, 'apps/server/dist', name)
// macOS remembers a binary's signature by its file: a build written over the old one in place is killed at launch.
rmSync(outfile, { force: true })

const result = Bun.spawnSync(
  [
    'bun',
    'build',
    '--compile',
    '--minify',
    // The binary runs inside the user's repo; that repo's bunfig preloads and .env must not reach it.
    '--no-compile-autoload-bunfig',
    '--no-compile-autoload-dotenv',
    ...(target ? ['--target', target] : []),
    'src/cli.ts',
    '--outfile',
    outfile,
  ],
  { cwd: join(root, 'apps/server'), stdout: 'inherit', stderr: 'inherit' },
)
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)

// Apple Silicon runs only signed code. A Mac build is checked, and signed ad hoc if it does not verify.
const forMac = target ? target.startsWith('bun-darwin') : process.platform === 'darwin'
if (forMac && process.platform === 'darwin') {
  const verifies = () => Bun.spawnSync(['codesign', '--verify', '--strict', outfile]).exitCode === 0
  if (!verifies()) Bun.spawnSync(['codesign', '--force', '--sign', '-', outfile], { stderr: 'inherit' })
  if (!verifies()) {
    console.error(`${outfile} has no valid signature, and macOS would kill it`)
    process.exit(1)
  }
}
