import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const EXTERNAL = /^(https?:|mailto:|#)/i
const LINK = 'text-tn-blue underline-offset-2 hover:underline'

// Raw HTML (bot summaries, <details>) is skipped rather than rendered or shown as text.
const components: Components = {
  // Every size is 15px here, so headings rank by color and a rule instead of by size.
  h1: ({ node: _, ...props }) => (
    <h3 {...props} className="mt-5 mb-2 border-border border-b pb-1 text-tn-blue first:mt-0" />
  ),
  h2: ({ node: _, ...props }) => (
    <h3 {...props} className="mt-5 mb-2 border-border border-b pb-1 text-tn-blue first:mt-0" />
  ),
  h3: ({ node: _, ...props }) => <h4 {...props} className="mt-4 mb-1 text-tn-cyan first:mt-0" />,
  p: ({ node: _, ...props }) => <p {...props} className="my-1.5 first:mt-0 last:mb-0" />,
  ul: ({ node: _, ...props }) => <ul {...props} className="my-1.5 list-disc ps-5" />,
  ol: ({ node: _, ...props }) => <ol {...props} className="my-1.5 list-decimal ps-5" />,
  blockquote: ({ node: _, ...props }) => (
    <blockquote {...props} className="my-1.5 border-border border-s-2 ps-3 text-muted-foreground" />
  ),
  code: ({ node: _, ...props }) => <code {...props} className="rounded-sm bg-muted px-1 text-tn-cyan" />,
  pre: ({ node: _, ...props }) => (
    <pre
      {...props}
      className="my-2 overflow-x-auto rounded-md border border-border bg-tn-dark p-3 [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  table: ({ node: _, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table {...props} className="border-collapse" />
    </div>
  ),
  th: ({ node: _, ...props }) => (
    <th {...props} className="border border-border px-2 py-1 text-start align-top [overflow-wrap:anywhere]" />
  ),
  td: ({ node: _, ...props }) => (
    <td {...props} className="border border-border px-2 py-1 align-top [overflow-wrap:anywhere]" />
  ),
  hr: () => <hr className="my-3 border-border" />,
  img: ({ node: _, alt, ...props }) => <img {...props} alt={alt ?? ''} className="max-w-full rounded-md" />,
  input: ({ node: _, ...props }) => <input {...props} className="me-1.5 align-middle" />,
}

export function Markdown({ text, onLocalLink }: { text: string; onLocalLink?: (href: string) => void }) {
  // Relative links point into the repo; with a handler they open there instead of a broken page url.
  const a: Components['a'] = ({ node: _, href = '', ...props }) =>
    EXTERNAL.test(href) || !onLocalLink ? (
      <a {...props} href={href} target="_blank" rel="noreferrer" className={LINK} />
    ) : (
      <a
        {...props}
        href={href}
        className={LINK}
        onClick={(event) => {
          event.preventDefault()
          onLocalLink(href)
        }}
      />
    )
  return (
    <div className="break-words text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ...components, a }} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
