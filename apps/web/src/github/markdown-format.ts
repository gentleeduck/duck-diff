export type Format = 'heading' | 'bold' | 'italic' | 'quote' | 'code' | 'link' | 'ordered' | 'bulleted' | 'task'

export interface Edit {
  value: string
  // The selection to restore after the edit.
  start: number
  end: number
}

const WRAP: Partial<Record<Format, string>> = { bold: '**', italic: '_' }
const PREFIX: Partial<Record<Format, (index: number) => string>> = {
  heading: () => '### ',
  quote: () => '> ',
  ordered: (index) => `${index + 1}. `,
  bulleted: () => '- ',
  task: () => '- [ ] ',
}

// GitHub's toolbar buttons: wrap the selection, or start each selected line, keeping the text selected.
export function applyFormat(value: string, start: number, end: number, format: Format): Edit {
  const selected = value.slice(start, end)
  const wrap = WRAP[format]
  if (wrap) {
    const next = `${value.slice(0, start)}${wrap}${selected}${wrap}${value.slice(end)}`
    return { value: next, start: start + wrap.length, end: end + wrap.length }
  }
  if (format === 'code') {
    // A selection over several lines becomes a fenced block; anything else inline code.
    if (selected.includes('\n')) {
      const block = `\`\`\`\n${selected}\n\`\`\``
      return {
        value: `${value.slice(0, start)}${block}${value.slice(end)}`,
        start: start + 4,
        end: start + 4 + selected.length,
      }
    }
    return { value: `${value.slice(0, start)}\`${selected}\`${value.slice(end)}`, start: start + 1, end: end + 1 }
  }
  if (format === 'link') {
    const text = `[${selected}](url)`
    const at = start + selected.length + 3
    return { value: `${value.slice(0, start)}${text}${value.slice(end)}`, start: at, end: at + 3 }
  }
  const prefix = PREFIX[format]
  if (!prefix) return { value, start, end }
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lines = value.slice(lineStart, end).split('\n')
  const changed = lines.map((line, index) => `${prefix(index)}${line}`).join('\n')
  return {
    value: `${value.slice(0, lineStart)}${changed}${value.slice(end)}`,
    start: start + prefix(0).length,
    end: lineStart + changed.length,
  }
}
