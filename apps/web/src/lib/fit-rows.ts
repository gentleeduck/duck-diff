// Rows for a text box that should show what it holds: at least min, growing with the text up to max,
// past which it scrolls. Long lines wrap, so a few rows are added for them.
export function fitRows(text: string, min: number, max = 28): number {
  const lines = text.split('\n')
  const wrapped = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 100)), 0)
  return Math.min(max, Math.max(min, wrapped + 1))
}
