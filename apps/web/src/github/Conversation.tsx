import type { ConversationComment, GitHubUser } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { MessageSquare } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { createStore, type Store, useStore } from '../lib/store'
import { MarkdownEditor } from './MarkdownEditor'
import { ago } from './time'

const NO_DRAFT = createStore('')
const selectDraft = (value: string) => value

export function Avatar({ user }: { user: GitHubUser }) {
  return user.avatarUrl ? (
    <img
      src={`${user.avatarUrl}${user.avatarUrl.includes('?') ? '&' : '?'}s=40`}
      alt=""
      className="size-5 rounded-full"
    />
  ) : (
    <span className="size-5 rounded-full bg-muted" />
  )
}

// The Markdown renderer is large, so it loads with the first comment instead of with the diff viewer.
const Markdown = lazy(() => import('../markdown/Markdown').then((module) => ({ default: module.Markdown })))

export function Body({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-muted-foreground">No description.</p>
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap break-words text-foreground">{text.trim()}</p>}>
      <Markdown text={text} />
    </Suspense>
  )
}

export function Comment({
  author,
  createdAt,
  body,
  extra,
  bare = false,
}: Omit<ConversationComment, 'id'> & { extra?: ReactNode; bare?: boolean }) {
  return (
    <article className={bare ? '' : 'rounded-md border border-border bg-card'}>
      <header className="flex items-center gap-2 border-border border-b px-3 py-1.5 text-muted-foreground">
        <Avatar user={author} />
        <span className="text-foreground">{author.login}</span>
        <span>{ago(createdAt)}</span>
        {extra ? <span className="ms-auto min-w-0 truncate">{extra}</span> : null}
      </header>
      <div className="px-3 py-2">
        <Body text={body} />
      </div>
    </article>
  )
}

export function Composer({
  label,
  onSend,
  children,
  draft,
}: {
  label: string
  onSend(body: string): Promise<void>
  // Extra buttons that also consume the text, like a review's approve.
  children?: (body: string, clear: () => void) => ReactNode
  // Lets the page put text in, like a quote reply.
  draft?: Store<string>
}) {
  const [local, setLocal] = useState('')
  const shared = useStore(draft ?? NO_DRAFT, selectDraft)
  const body = draft ? shared : local
  const setBody = (next: string) => (draft ? draft.set(next) : setLocal(next))
  const [sending, setSending] = useState(false)
  const send = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      await onSend(body)
      setBody('')
    } catch {
      // The sender reported it; the text stays so nothing typed is lost.
    } finally {
      setSending(false)
    }
  }
  return (
    <form
      aria-label={label}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}>
      <MarkdownEditor label={label} value={body} onChange={setBody} onSubmit={() => void send()} />
      <div className="flex flex-wrap justify-end gap-2">
        {children?.(body, () => setBody(''))}
        <Button type="submit" size="sm" disabled={!body.trim()} loading={sending}>
          <MessageSquare />
          Comment
        </Button>
      </div>
    </form>
  )
}
