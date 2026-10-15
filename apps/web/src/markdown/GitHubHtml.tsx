import DOMPurify from 'dompurify'
import { useMemo } from 'react'

// Links leave the app for a browser tab; nothing GitHub rendered can run script or style the page.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer')
  }
})

// Shows a body exactly as GitHub rendered it: bot HTML, <details>, tables, mentions and emoji included.
export function GitHubHtml({ html }: { html: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] }),
    [html],
  )
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify just above
  return <div className="gh-markdown break-words text-foreground" dangerouslySetInnerHTML={{ __html: clean }} />
}
