import { spawn } from 'node:child_process'

export type NvimRunner = (args: string[]) => Promise<void>

// Characters the Ex command line treats specially in a file name.
const SPECIAL = /([ \\#%|"])/g

export function openKeys(file: string, line: number): string {
  return `<C-\\><C-n>:edit +${Math.max(1, line)} ${file.replace(SPECIAL, '\\$1')}<CR>`
}

// Switches the current tab to another checkout, as :tcd does, so the tab's files resolve there.
export function tcdKeys(path: string): string {
  return `<C-\\><C-n>:tcd ${path.replace(SPECIAL, '\\$1')}<CR>`
}

export const runNvim: NvimRunner = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('nvim', args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`nvim exited ${code}`))))
  })

export type NvimEval = (address: string, expr: string) => Promise<string>

export const evalNvim: NvimEval = (address, expr) =>
  new Promise((resolve, reject) => {
    const child = spawn('nvim', ['--server', address, '--remote-expr', expr], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    const timer = setTimeout(() => child.kill(), 15_000)
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve(out) : reject(new Error(`nvim exited ${code}`))
    })
  })

// A Lua call with its argument as one Vim string, which only needs its single quotes doubled.
export function luaCall(module: string, fn: string, argument: string): string {
  return `luaeval('require("${module}").${fn}(_A)', '${argument.replace(/'/g, "''")}')`
}
