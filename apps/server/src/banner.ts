import { ansi, header, paintFor } from './cli-ui'

// The terminal start: the header every command shares, then where the page is.
export function startBanner(
  { version, repo, branch, url }: { version: string; repo: string; branch: string | null; url: string },
  color: boolean = paintFor(),
): string {
  const green = ansi('1;32', color)
  const info = ansi('36', color)
  const dim = ansi('2', color)
  return [
    '',
    ...header(version, color),
    '',
    `${green('✔')} Serving ${info(repo)}${branch ? ` on ${info(branch)}` : ''}`,
    `Open ${info(url)}`,
    dim('Ctrl-C stops it. It also stops on its own once no page has been open for a while.'),
    '',
  ].join('\n')
}
