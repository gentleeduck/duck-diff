import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runGit } from '@duck-diff/git'

const NAME = 'duck-diff'

interface Change {
  key: string
  // What was there before, or null when the key was unset.
  was: string | null
  now: string | null
}

// config: another file to stand in for the global config, for tests; the user's own otherwise.
function configFile(config?: string) {
  const options = { cwd: '/', ...(config ? { env: { GIT_CONFIG_GLOBAL: config } } : {}) }
  return {
    read: async (key: string) =>
      (await runGit(['config', '--global', '--get', key], { ...options, okExitCodes: [1] })).trim() || null,
    set: (key: string, value: string) => runGit(['config', '--global', key, value], options),
    unset: (key: string) => runGit(['config', '--global', '--unset-all', key], { ...options, okExitCodes: [5] }),
  }
}

// What git-setup set where the user had nothing, so --off takes back exactly that and leaves their own alone.
const ledger = (home: string) => join(home, 'git-setup.json')
async function readLedger(home: string): Promise<string[]> {
  try {
    return JSON.parse(await readFile(ledger(home), 'utf8')) as string[]
  } catch {
    return []
  }
}

export interface SetupResult {
  changes: Change[]
  // Keys left as the user had them.
  kept: { key: string; value: string }[]
}

// Makes duck-diff git's merge tool (merges, cherry-picks, reverts, rebases, stash pops), diff tool and rebase todo
// editor in the global config. Its own tool entries always point at this binary; the choices (merge.tool,
// diff.tool, sequence.editor, the prompts and .orig backups) are taken only where the user has none or already
// chose duck-diff.
export async function gitSetup(command: string, home: string, config?: string): Promise<SetupResult> {
  const { read, set } = configFile(config)
  const changes: Change[] = []
  const kept: SetupResult['kept'] = []
  const claimed = new Set(await readLedger(home))
  const put = async (key: string, value: string, mode: 'ours' | 'default') => {
    const was = await read(key)
    if (was === value) return
    if (mode === 'default' && was !== null && !was.includes(NAME)) {
      kept.push({ key, value: was })
      return
    }
    await set(key, value)
    if (was === null) claimed.add(key)
    changes.push({ key, was, now: value })
  }
  await put(`mergetool.${NAME}.cmd`, `${command} mergetool "$MERGED"`, 'ours')
  await put(`mergetool.${NAME}.trustExitCode`, 'true', 'ours')
  await put(`difftool.${NAME}.cmd`, `${command} difftool "$LOCAL" "$REMOTE" "$MERGED"`, 'ours')
  await put(`difftool.${NAME}.trustExitCode`, 'true', 'ours')
  await put('merge.tool', NAME, 'default')
  await put('diff.tool', NAME, 'default')
  await put('sequence.editor', `${command} rebase-todo`, 'default')
  await put('mergetool.prompt', 'false', 'default')
  await put('mergetool.keepBackup', 'false', 'default')
  await put('difftool.prompt', 'false', 'default')
  await mkdir(dirname(ledger(home)), { recursive: true })
  await writeFile(ledger(home), JSON.stringify([...claimed]))
  return { changes, kept }
}

// Takes back what gitSetup set: duck-diff's own tool entries, the choices naming duck-diff, and the prompts and
// backups only where it was the one that set them.
export async function gitSetupOff(home: string, config?: string): Promise<Change[]> {
  const { read, unset } = configFile(config)
  const changes: Change[] = []
  const claimed = new Set(await readLedger(home))
  const drop = async (key: string, when: (value: string) => boolean) => {
    const was = await read(key)
    if (was === null || !when(was)) return
    await unset(key)
    changes.push({ key, was, now: null })
  }
  for (const key of [`mergetool.${NAME}.cmd`, `mergetool.${NAME}.trustExitCode`, `difftool.${NAME}.cmd`])
    await drop(key, () => true)
  await drop(`difftool.${NAME}.trustExitCode`, () => true)
  await drop('merge.tool', (value) => value === NAME)
  await drop('diff.tool', (value) => value === NAME)
  await drop('sequence.editor', (value) => value.includes(NAME))
  for (const key of ['mergetool.prompt', 'mergetool.keepBackup', 'difftool.prompt'])
    await drop(key, () => claimed.has(key))
  await writeFile(ledger(home), '[]').catch(() => {})
  return changes
}
