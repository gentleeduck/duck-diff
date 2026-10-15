// The terminal start, in duck-cli's style: the name and version over a green rule, then where the page is.
export function paintFor(stream: { isTTY?: boolean } = process.stdout, env = process.env): boolean {
  return Boolean(stream.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb'
}

const ansi = (code: string, color: boolean) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)

export function startBanner(
  { version, repo, branch, url }: { version: string; repo: string; branch: string | null; url: string },
  color: boolean = paintFor(),
): string {
  const white = ansi('37', color)
  const rule = ansi('1;32', color)
  const info = ansi('36', color)
  const dim = ansi('2', color)
  const title = ` 🦆 @gentleduck/diff ${version}`
  return [
    '',
    white(title),
    rule('─'.repeat(title.length)),
    '',
    `${rule('✔')} Serving ${info(repo)}${branch ? ` on ${info(branch)}` : ''}`,
    `Open ${info(url)}`,
    dim('Ctrl-C stops it. It also stops on its own once no page has been open for a while.'),
    '',
  ].join('\n')
}
