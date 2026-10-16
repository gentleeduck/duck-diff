// Dark themes only. Each is a palette in tokyonight's slots; the page, the diff and the code colors all read
// these variables, so switching is one style change and nothing is highlighted again.
export interface Palette {
  bg: string
  bgDark: string
  bgHighlight: string
  gutter: string
  fg: string
  fgDark: string
  comment: string
  dark5: string
  blue: string
  cyan: string
  magenta: string
  pink: string
  orange: string
  yellow: string
  green: string
  teal: string
  red: string
}

export const THEMES = {
  'tokyo-night': {
    label: 'Tokyo Night',
    note: 'the house default; neon over midnight',
    colors: {
      bg: '#1a1b26',
      bgDark: '#16161e',
      bgHighlight: '#292e42',
      gutter: '#3b4261',
      fg: '#c0caf5',
      fgDark: '#a9b1d6',
      comment: '#565f89',
      dark5: '#737aa2',
      blue: '#7aa2f7',
      cyan: '#7dcfff',
      magenta: '#bb9af7',
      pink: '#ff007c',
      orange: '#ff9e64',
      yellow: '#e0af68',
      green: '#9ece6a',
      teal: '#73daca',
      red: '#f7768e',
    },
  },
  mallard: {
    label: 'Mallard',
    note: "wildduck's own: pond at 3am, teal neck, orange bill",
    colors: {
      bg: '#11161b',
      bgDark: '#0c1014',
      bgHighlight: '#1c252e',
      gutter: '#2f3b47',
      fg: '#d3dde8',
      fgDark: '#a9b6c4',
      comment: '#5a6b7c',
      dark5: '#7b8a9b',
      blue: '#5fb3ff',
      cyan: '#5ee6d0',
      magenta: '#c49bff',
      pink: '#ff6ab8',
      orange: '#ff9f43',
      yellow: '#ffd25e',
      green: '#88d66c',
      teal: '#2ec4a6',
      red: '#ff6b7f',
    },
  },
  'tokyo-storm': {
    label: 'Tokyo Storm',
    note: 'tokyonight with the clouds rolled in',
    colors: {
      bg: '#24283b',
      bgDark: '#1f2335',
      bgHighlight: '#2f344d',
      gutter: '#3b4261',
      fg: '#c0caf5',
      fgDark: '#a9b1d6',
      comment: '#565f89',
      dark5: '#737aa2',
      blue: '#7aa2f7',
      cyan: '#7dcfff',
      magenta: '#bb9af7',
      pink: '#ff007c',
      orange: '#ff9e64',
      yellow: '#e0af68',
      green: '#9ece6a',
      teal: '#73daca',
      red: '#f7768e',
    },
  },
  catppuccin: {
    label: 'Catppuccin Mocha',
    note: 'pastel, soothing, very online',
    colors: {
      bg: '#1e1e2e',
      bgDark: '#181825',
      bgHighlight: '#313244',
      gutter: '#45475a',
      fg: '#cdd6f4',
      fgDark: '#bac2de',
      comment: '#6c7086',
      dark5: '#7f849c',
      blue: '#89b4fa',
      cyan: '#89dceb',
      magenta: '#cba6f7',
      pink: '#f5c2e7',
      orange: '#fab387',
      yellow: '#f9e2af',
      green: '#a6e3a1',
      teal: '#94e2d5',
      red: '#f38ba8',
    },
  },
  kanagawa: {
    label: 'Kanagawa',
    note: 'the great wave, in ink',
    colors: {
      bg: '#1f1f28',
      bgDark: '#16161d',
      bgHighlight: '#2a2a37',
      gutter: '#54546d',
      fg: '#dcd7ba',
      fgDark: '#c8c093',
      comment: '#727169',
      dark5: '#938aa9',
      blue: '#7e9cd8',
      cyan: '#7fb4ca',
      magenta: '#957fb8',
      pink: '#d27e99',
      orange: '#ffa066',
      yellow: '#e6c384',
      green: '#98bb6c',
      teal: '#7aa89f',
      red: '#e46876',
    },
  },
  gruvbox: {
    label: 'Gruvbox',
    note: 'retro groove, warm as a CRT',
    colors: {
      bg: '#282828',
      bgDark: '#1d2021',
      bgHighlight: '#3c3836',
      gutter: '#504945',
      fg: '#ebdbb2',
      fgDark: '#d5c4a1',
      comment: '#928374',
      dark5: '#a89984',
      blue: '#83a598',
      cyan: '#8ec07c',
      magenta: '#d3869b',
      pink: '#d3869b',
      orange: '#fe8019',
      yellow: '#fabd2f',
      green: '#b8bb26',
      teal: '#8ec07c',
      red: '#fb4934',
    },
  },
  'rose-pine': {
    label: 'Rosé Pine',
    note: 'soho vibes for the classy minimalist',
    colors: {
      bg: '#191724',
      bgDark: '#14121d',
      bgHighlight: '#26233a',
      gutter: '#403d52',
      fg: '#e0def4',
      fgDark: '#908caa',
      comment: '#6e6a86',
      dark5: '#908caa',
      blue: '#9ccfd8',
      cyan: '#ebbcba',
      magenta: '#c4a7e7',
      pink: '#eb6f92',
      orange: '#f6c177',
      yellow: '#f6c177',
      green: '#9ccfd8',
      teal: '#56949f',
      red: '#eb6f92',
    },
  },
  nord: {
    label: 'Nord',
    note: 'arctic, calm, slightly judgmental',
    colors: {
      bg: '#2e3440',
      bgDark: '#272c36',
      bgHighlight: '#3b4252',
      gutter: '#4c566a',
      fg: '#eceff4',
      fgDark: '#d8dee9',
      comment: '#616e88',
      dark5: '#7b88a1',
      blue: '#81a1c1',
      cyan: '#88c0d0',
      magenta: '#b48ead',
      pink: '#b48ead',
      orange: '#d08770',
      yellow: '#ebcb8b',
      green: '#a3be8c',
      teal: '#8fbcbb',
      red: '#bf616a',
    },
  },
  dracula: {
    label: 'Dracula',
    note: 'for vampires who ship at midnight',
    colors: {
      bg: '#282a36',
      bgDark: '#21222c',
      bgHighlight: '#363847',
      gutter: '#44475a',
      fg: '#f8f8f2',
      fgDark: '#e2e2dc',
      comment: '#6272a4',
      dark5: '#7970a9',
      blue: '#bd93f9',
      cyan: '#8be9fd',
      magenta: '#ff79c6',
      pink: '#ff79c6',
      orange: '#ffb86c',
      yellow: '#f1fa8c',
      green: '#50fa7b',
      teal: '#8be9fd',
      red: '#ff5555',
    },
  },
  'one-dark': {
    label: 'One Dark',
    note: 'the atom classic, still kicking',
    colors: {
      bg: '#282c34',
      bgDark: '#21252b',
      bgHighlight: '#2c313c',
      gutter: '#4b5263',
      fg: '#abb2bf',
      fgDark: '#9da5b4',
      comment: '#5c6370',
      dark5: '#7f848e',
      blue: '#61afef',
      cyan: '#56b6c2',
      magenta: '#c678dd',
      pink: '#e06c75',
      orange: '#d19a66',
      yellow: '#e5c07b',
      green: '#98c379',
      teal: '#56b6c2',
      red: '#e06c75',
    },
  },
} satisfies Record<string, { label: string; note: string; colors: Palette }>

export type ThemeName = keyof typeof THEMES
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]
export const DEFAULT_THEME: ThemeName = 'tokyo-night'

const SLOTS: Record<keyof Palette, string> = {
  bg: '--tn-bg',
  bgDark: '--tn-bg-dark',
  bgHighlight: '--tn-bg-highlight',
  gutter: '--tn-gutter',
  fg: '--tn-fg',
  fgDark: '--tn-fg-dark',
  comment: '--tn-comment',
  dark5: '--tn-dark5',
  blue: '--tn-blue',
  cyan: '--tn-cyan',
  magenta: '--tn-magenta',
  pink: '--tn-pink',
  orange: '--tn-orange',
  yellow: '--tn-yellow',
  green: '--tn-green',
  teal: '--tn-teal',
  red: '--tn-red',
}

// Code colors by role, from the palette; tokyo-night keeps the exact shades theme.css gives it.
const syntax = (c: Palette): Record<string, string> => ({
  '--syn-keyword': c.magenta,
  '--syn-text': c.fg,
  '--syn-tag': c.red,
  '--syn-function': c.blue,
  '--syn-type': c.cyan,
  '--syn-class': c.yellow,
  '--syn-property': c.cyan,
  '--syn-key': c.teal,
  '--syn-operator': c.cyan,
  '--syn-string': c.green,
  '--syn-param': c.fgDark,
  '--syn-number': c.orange,
  '--syn-special': c.magenta,
  '--syn-comment': c.comment,
})

// The variables a theme sets on <html>. Tokyo Night sets none: theme.css is already it, to the shade.
export function themeVariables(name: ThemeName): Record<string, string> {
  if (name === DEFAULT_THEME) return {}
  const colors: Palette = THEMES[name].colors
  const vars: Record<string, string> = {}
  for (const [slot, value] of Object.entries(colors)) vars[SLOTS[slot as keyof Palette]] = value
  vars['--diff-add-bg'] = `color-mix(in oklab, ${colors.green} 16%, ${colors.bg})`
  vars['--diff-del-bg'] = `color-mix(in oklab, ${colors.red} 16%, ${colors.bg})`
  vars['--diff-add-word'] = `color-mix(in oklab, ${colors.green} 34%, ${colors.bg})`
  vars['--diff-del-word'] = `color-mix(in oklab, ${colors.red} 34%, ${colors.bg})`
  // The muted git colors tokyonight gives nvim-tree, mixed the same way for every other palette.
  vars['--tn-git-add'] = `color-mix(in oklab, ${colors.teal} 55%, ${colors.bg})`
  vars['--tn-git-change'] = `color-mix(in oklab, ${colors.blue} 70%, ${colors.bg})`
  vars['--tn-git-delete'] = `color-mix(in oklab, ${colors.red} 55%, ${colors.bg})`
  return { ...vars, ...syntax(colors) }
}

const ALL = [
  ...Object.values(SLOTS),
  '--diff-add-bg',
  '--diff-del-bg',
  '--diff-add-word',
  '--diff-del-word',
  '--tn-git-add',
  '--tn-git-change',
  '--tn-git-delete',
]

export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement) {
  for (const variable of [...ALL, ...Object.keys(syntax(THEMES[DEFAULT_THEME].colors))])
    root.style.removeProperty(variable)
  for (const [variable, value] of Object.entries(themeVariables(name))) root.style.setProperty(variable, value)
  root.classList.add('dark')
  root.dataset.theme = name
}
