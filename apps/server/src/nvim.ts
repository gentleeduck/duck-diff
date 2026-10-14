import { spawn } from 'node:child_process'

export type NvimRunner = (args: string[]) => Promise<void>

// Characters the Ex command line treats specially in a file name.
const SPECIAL = /([ \\#%|"])/g

export function openKeys(file: string, line: number): string {
  return `<C-\\><C-n>:edit +${Math.max(1, line)} ${file.replace(SPECIAL, '\\$1')}<CR>`
}

export const runNvim: NvimRunner = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('nvim', args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`nvim exited ${code}`))))
  })
