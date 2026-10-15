import { VERSION } from './args'

// Colors only for a terminal that wants them (https://no-color.org).
const tty = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
const paint = (code: string) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text)
const bold = paint('1')
const dim = paint('2')
const blue = paint('34')
const magenta = paint('35')
const green = paint('32')

const head = (text: string) => bold(magenta(text))
const rows = (entries: [string, string][]) => {
  const width = Math.max(...entries.map(([left]) => left.length)) + 3
  return entries.map(([left, right]) => `  ${blue(left.padEnd(width))}${right}`).join('\n')
}

const MAIN =
  () => `${bold('duck-diff')} ${dim(VERSION)}  ${dim('a git diff viewer and GitHub client that lives in your browser and quacks back')}

${head('Usage')}
${rows([
  ['duck-diff [<target>] [options]', 'open a diff'],
  ['duck-diff <command> [args] [options]', 'open a view, or run a command'],
])}

${head('Targets')}
${rows([
  ['(nothing)', 'your uncommitted changes against HEAD'],
  ['staged | unstaged', 'one side of the index'],
  ['<ref>', 'what this branch adds on top of <ref>, the pull request view'],
  ['<a>...<b>', 'what <b> adds since it left <a>'],
  ['<a>..<b>', 'the two trees, tip to tip'],
  ['commit [<sha>]', 'one commit (HEAD when left out)'],
])}

${head('Views')}
${rows([
  ['graph', 'the commit graph, every branch drawn'],
  ['files [<path>[:<line>]]', 'browse the tree, or one file at a line'],
  ['prs [<number>]', 'pull requests, or one of them'],
  ['issues [<number>]', 'issues, or one of them'],
  ['inbox', 'your GitHub notifications'],
  ['releases | actions', 'releases, workflow runs'],
  ['discussions | security', 'discussions, security alerts'],
  ['insights | merge', 'who works on what, the conflict resolver'],
])}

${head('Commands')}
${rows([
  ['serve', 'run the server for an editor plugin (speaks JSON on stdout)'],
  ['update [<version>]', 'replace this binary with the latest release, or <version>'],
  ['cache clear', 'empty the GitHub and commit caches'],
  ['help [<command>]', 'this page, or one command in detail'],
  ['version', 'print the version'],
])}

${head('Options')}
${rows([
  ['-C, --repo <path>', 'the repository (default: where you are)'],
  ['-p, --port <n>', 'listen on this port (default: any free one)'],
  ['--no-open', 'print the url instead of opening a browser'],
  ['--no-terminal', 'no shell in the page'],
  ['-h, --help', 'help, as you found out'],
  ['-v, --version', 'the version'],
])}

${head('Examples')}
${rows([
  ['duck-diff', 'what you changed'],
  ['duck-diff main', 'what this branch adds on top of main'],
  ['duck-diff prs 12', 'pull request #12, conversation and all'],
  ['duck-diff files src/app.ts:40', 'a file, at line 40'],
  ['duck-diff graph -C ~/code/thing', 'the graph of another repo'],
])}

A page already open for the repo is reused: the view opens there in a new tab, no second server.
Settings, comments and caches live in ${green('$XDG_DATA_HOME/duck-diff')}. Ctrl-C stops it.`

const TOPICS: Record<string, () => string> = {
  serve: () => `${bold('duck-diff serve')} ${dim('[--repo <path>]... [--port <n>] [--nvim <address>] [--no-terminal]')}

Runs the server for an editor plugin and prints one line of JSON: ${green('{"port":…,"token":…,"url":…}')}.
It stops when its stdin closes (the editor quit) or after ${dim('--idle-timeout-ms')} with no page open.

${rows([
  ['--repo <path>', 'the repository; more --repo flags fill the repo switcher'],
  ['--nvim <address>', "the editor's server address, for opening files in it"],
  ['--idle-timeout-ms <n>', 'stop after this long with no page (default 600000)'],
])}`,
  update: () => `${bold('duck-diff update')} ${dim('[<version>]')}

Downloads the release for this machine from GitHub, checks its sha256 against the release's checksums,
and puts it over this binary. A running server picks the new build up on its own and pages reload.
Private repos need a token: ${green('GITHUB_TOKEN')}, ${green('GH_TOKEN')} or a ${green('gh auth login')}.`,
  cache: () => `${bold('duck-diff cache clear')} ${dim('[--repo <path>]')}

Empties the GitHub answers, commit details and graph kept on disk, for one repo or all of them.
Comments, settings and the repo list stay.`,
  diff: () => `${bold('duck-diff')} ${dim('[diff] [<target>]')}

${rows([
  ['(nothing)', 'your uncommitted changes against HEAD'],
  ['staged | unstaged', 'one side of the index'],
  ['<ref>', 'what this branch adds on top of <ref>'],
  ['<a>...<b>', 'what <b> adds since it left <a>'],
  ['<a>..<b>', 'the two trees, tip to tip'],
  ['commit [<sha>]', 'one commit'],
])}

Use ${blue('duck-diff diff <ref>')} when a branch is called like a view (graph, files, prs...).`,
}

export function help(topic: string | null): string {
  if (topic && TOPICS[topic]) return (TOPICS[topic] as () => string)()
  return MAIN()
}

export const say = { bold, dim, blue, green, magenta }
