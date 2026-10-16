import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ITheme, Terminal } from '@xterm/xterm'

export type { Terminal }

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

// kitty's tokyonight-night shape, colored from the page's theme.
function theme(): ITheme {
  return {
    background: css('--background', '#1a1b26'),
    foreground: css('--foreground', '#c0caf5'),
    cursor: css('--foreground', '#c0caf5'),
    cursorAccent: css('--background', '#1a1b26'),
    selectionBackground: css('--tn-bg-highlight', '#283457'),
    black: css('--tn-bg-dark', '#15161e'),
    red: css('--tn-red', '#f7768e'),
    green: css('--tn-green', '#9ece6a'),
    yellow: css('--tn-yellow', '#e0af68'),
    blue: css('--tn-blue', '#7aa2f7'),
    magenta: css('--tn-magenta', '#bb9af7'),
    cyan: css('--tn-cyan', '#7dcfff'),
    white: css('--tn-fg-dark', '#a9b1d6'),
    brightBlack: css('--tn-gutter', '#414868'),
    brightRed: css('--tn-red', '#f7768e'),
    brightGreen: css('--tn-green', '#9ece6a'),
    brightYellow: css('--tn-yellow', '#e0af68'),
    brightBlue: css('--tn-blue', '#7aa2f7'),
    brightMagenta: css('--tn-magenta', '#bb9af7'),
    brightCyan: css('--tn-cyan', '#7dcfff'),
    brightWhite: css('--tn-fg', '#c0caf5'),
  }
}

export interface Mounted {
  terminal: Terminal
  fit(): void
  // Reads the page's colors again, after the theme changed.
  retheme(): void
  dispose(): void
}

export function mountTerminal(
  element: HTMLElement,
  options: { fontSize: number; fontWeight: number; readOnly: boolean },
): Mounted {
  const terminal = new Terminal({
    allowProposedApi: true,
    fontFamily: css('--font-sans', 'monospace'),
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
    fontWeightBold: 700,
    lineHeight: 1.2,
    theme: theme(),
    scrollback: 10_000,
    cursorBlink: !options.readOnly,
    cursorStyle: 'block',
    disableStdin: options.readOnly,
    // Job output is git's raw stream, which ends lines with \n alone.
    convertEol: options.readOnly,
    macOptionIsMeta: true,
    rightClickSelectsWord: true,
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  const unicode = new Unicode11Addon()
  terminal.loadAddon(unicode)
  terminal.unicode.activeVersion = '11'
  terminal.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')))
  // Ctrl+` belongs to the page (it hides the panel), not the shell.
  terminal.attachCustomKeyEventHandler((event) => !(event.ctrlKey && event.key === '`'))
  terminal.open(element)
  // The GPU renderer keeps a flood of output cheap; the DOM one takes over if WebGL is missing or lost.
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    terminal.loadAddon(webgl)
  } catch {}
  const doFit = () => {
    // A hidden pane (another panel tab is showing) has no size; fitting it would shrink the shell to a few
    // columns and make it redraw its prompt twice, once there and once back.
    if (!element.clientWidth || !element.clientHeight) return
    try {
      fit.fit()
    } catch {}
  }
  doFit()
  // A glyph drawn before its web font arrived stays in the GPU atlas as a box, so the terminal draws again
  // once the page's fonts, the Nerd Font icons among them, have loaded.
  let disposed = false
  document.fonts
    ?.load(`${options.fontSize}px "Symbols Nerd Font"`, '')
    .then(() => document.fonts.ready)
    .then(() => {
      if (disposed) return
      terminal.clearTextureAtlas()
      doFit()
    })
    .catch(() => {})
  return {
    terminal,
    fit: doFit,
    retheme: () => {
      terminal.options.theme = theme()
    },
    dispose: () => {
      disposed = true
      terminal.dispose()
    },
  }
}
