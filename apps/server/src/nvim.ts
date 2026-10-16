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

// Bun.spawn, not node:child_process: in Bun that can lose a quick child's exit and output (oven-sh/bun#45483).
export const runNvim: NvimRunner = async (args) => {
  const code = await Bun.spawn(['nvim', ...args], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }).exited
  if (code !== 0) throw new Error(`nvim exited ${code}`)
}

export type NvimEval = (address: string, expr: string) => Promise<string>

export const evalNvim: NvimEval = async (address, expr) => {
  const child = Bun.spawn(['nvim', '--server', address, '--remote-expr', expr], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const timer = setTimeout(() => child.kill(), 15_000)
  try {
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
    if (code !== 0) throw new Error(`nvim exited ${code}`)
    return out
  } finally {
    clearTimeout(timer)
  }
}

// A Lua call with its argument as one Vim string, which only needs its single quotes doubled.
export function luaCall(module: string, fn: string, argument: string): string {
  return `luaeval('require("${module}").${fn}(_A)', '${argument.replace(/'/g, "''")}')`
}
