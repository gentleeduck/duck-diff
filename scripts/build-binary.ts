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
process.exit(result.exitCode ?? 1)
