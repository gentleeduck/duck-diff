import { runGit } from './run'

export async function resolveRepo(cwd: string): Promise<string> {
  return (await runGit(['rev-parse', '--show-toplevel'], { cwd })).trim()
}
