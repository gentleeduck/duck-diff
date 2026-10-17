import * as React from 'react'

// Bare words in a control get a box of their own, which styles.css centres on their capitals. Words that sit
// side by side (`Confirm {method}`) share one box, as they share one run of text.
export function labelled(children: React.ReactNode): React.ReactNode {
  const out: React.ReactNode[] = []
  let words: (string | number)[] = []
  const flush = () => {
    if (words.length)
      out.push(
        <span key={`text-${out.length}`} data-slot="text">
          {words.join('')}
        </span>,
      )
    words = []
  }
  for (const child of React.Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') words.push(child)
    else {
      flush()
      out.push(child)
    }
  }
  flush()
  return out
}
