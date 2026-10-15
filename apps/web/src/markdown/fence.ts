// Code fences name languages (```typescript); the highlighter picks one from a file name.
const EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  typescriptreact: 'tsx',
  javascript: 'js',
  javascriptreact: 'jsx',
  rust: 'rs',
  python: 'py',
  ruby: 'rb',
  golang: 'go',
  shell: 'sh',
  bash: 'sh',
  zsh: 'sh',
  markdown: 'md',
  yml: 'yaml',
  csharp: 'cs',
  kotlin: 'kt',
  haskell: 'hs',
  elixir: 'ex',
  terraform: 'tf',
}

export const fencePath = (language: string) => `file.${EXTENSIONS[language.toLowerCase()] ?? language}`
