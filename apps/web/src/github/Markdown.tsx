import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Raw HTML (bot summaries, <details>) is skipped rather than rendered or shown as text.
const components: Components = {
  a: ({ node: _, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" className="text-tn-blue underline-offset-2 hover:underline" />
  ),
  h1: ({ node: _, ...props }) => <h3 {...props} className="mt-3 mb-1 text-foreground first:mt-0" />,
  h2: ({ node: _, ...props }) => <h3 {...props} className="mt-3 mb-1 text-foreground first:mt-0" />,
  h3: ({ node: _, ...props }) => <h4 {...props} className="mt-3 mb-1 text-foreground first:mt-0" />,
  p: ({ node: _, ...props }) => <p {...props} className="my-1.5 first:mt-0 last:mb-0" />,
  ul: ({ node: _, ...props }) => <ul {...props} className="my-1.5 list-disc ps-5" />,
  ol: ({ node: _, ...props }) => <ol {...props} className="my-1.5 list-decimal ps-5" />,
  blockquote: ({ node: _, ...props }) => (
    <blockquote {...props} className="my-1.5 border-border border-s-2 ps-3 text-muted-foreground" />
  ),
  code: ({ node: _, ...props }) => <code {...props} className="rounded-sm bg-muted px-1 text-tn-cyan" />,
  pre: ({ node: _, ...props }) => (
    <pre {...props} className="my-2 overflow-x-auto rounded-md bg-tn-dark p-3 [&_code]:bg-transparent [&_code]:p-0" />
  ),
  table: ({ node: _, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table {...props} className="border-collapse" />
    </div>
  ),
  th: ({ node: _, ...props }) => <th {...props} className="border border-border px-2 py-1 text-start" />,
  td: ({ node: _, ...props }) => <td {...props} className="border border-border px-2 py-1" />,
  hr: () => <hr className="my-3 border-border" />,
  img: ({ node: _, alt, ...props }) => <img {...props} alt={alt ?? ''} className="max-w-full rounded-md" />,
  input: ({ node: _, ...props }) => <input {...props} className="me-1.5 align-middle" />,
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="break-words text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
