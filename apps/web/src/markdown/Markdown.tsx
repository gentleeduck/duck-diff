import type { Element, ElementContent } from 'hast'
import { type ReactNode, useSyncExternalStore } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { Code } from '../diff/Code'
import { highlighter } from '../diff/highlighter'

const EXTERNAL = /^(https?:|mailto:|#)/i
const REMOTE = /^(https?:|data:|\/\/)/i

// HTML in markdown is kept the way GitHub keeps it: its safe tags and attributes, plus the align and
// sizes READMEs center their logos with. Scripts, styles and event handlers are dropped.
const SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'align'],
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height'],
  },
}
const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i
const ALERT_TITLE: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

// The [!KIND] that opens a GitHub alert, read from the blockquote's first text.
function alertKind(node: Element | undefined): string | null {
  const first = node?.children.find((child): child is Element => child.type === 'element')
  const text = first?.children.find((child: ElementContent) => child.type === 'text')
  if (text?.type !== 'text') return null
  return ALERT.exec(text.value)?.[1]?.toLowerCase() ?? null
}

// Removes the [!KIND] marker from the rendered children, leaving the alert's own words.
function withoutMarker(children: ReactNode): ReactNode {
  let done = false
  const strip = (node: ReactNode): ReactNode => {
    if (done) return node
    if (typeof node === 'string') {
      if (!ALERT.test(node)) return node
      done = true
      return node.replace(ALERT, '')
    }
    if (Array.isArray(node)) return node.map(strip)
    if (node && typeof node === 'object' && 'props' in node) {
      const element = node as { props: { children?: ReactNode } } & object
      const inner = strip(element.props.children)
      return { ...element, props: { ...element.props, children: inner } } as ReactNode
    }
    return node
  }
  return strip(children)
}

function Fenced({ language, text }: { language: string; text: string }) {
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const tokens = highlighter.text(`md:${language}:${text.length}:${text.slice(0, 64)}`, `file.${language}`, text)
  return (
    <code>
      {text.split('\n').map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed block
        <span key={index} className="block min-h-[1.6em]">
          <Code text={line} tokens={tokens?.get(index + 1)} />
        </span>
      ))}
    </code>
  )
}

// The look comes from .gh-markdown, shared with GitHub's own rendered HTML.
const components: Components = {
  blockquote: ({ node, children, ...props }) => {
    const kind = alertKind(node)
    if (!kind) return <blockquote {...props}>{children}</blockquote>
    return (
      <div className={`markdown-alert markdown-alert-${kind}`}>
        <p className="markdown-alert-title">{ALERT_TITLE[kind]}</p>
        {withoutMarker(children)}
      </div>
    )
  },
  code: ({ node: _, className, children, ...props }) => {
    const language = /language-([\w+-]+)/.exec(className ?? '')?.[1]
    const text = String(children ?? '').replace(/\n$/, '')
    return language ? (
      <Fenced language={language} text={text} />
    ) : (
      <code {...props} className={className}>
        {children}
      </code>
    )
  },
}

export function Markdown({
  text,
  onLocalLink,
  imageUrl,
}: {
  text: string
  onLocalLink?: (href: string) => void
  // Where a relative image is read from, for a file's README; without it relative images stay as written.
  imageUrl?: (src: string) => string
}) {
  const img: Components['img'] = ({ node: _, alt, src, ...props }) => (
    <img
      {...props}
      alt={alt ?? ''}
      src={typeof src === 'string' && imageUrl && !REMOTE.test(src) ? imageUrl(src) : src}
    />
  )
  // Relative links point into the repo; with a handler they open there instead of a broken page url.
  const a: Components['a'] = ({ node: _, href = '', ...props }) =>
    EXTERNAL.test(href) || !onLocalLink ? (
      <a {...props} href={href} target="_blank" rel="noreferrer" />
    ) : (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          onLocalLink(href)
        }}
      />
    )
  return (
    <div className="gh-markdown text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}
        components={{ ...components, a, img }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
