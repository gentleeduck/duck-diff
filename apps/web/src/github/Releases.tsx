import type { Release } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Skeleton,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw, SquareArrowOutUpRight, Tag } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { Avatar, Body } from './Conversation'
import { MarkdownEditor } from './MarkdownEditor'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'

const SKELETONS = ['a', 'b', 'c']

function ReleaseCard({ release }: { release: Release }) {
  return (
    <article
      aria-label={release.name || release.tag}
      className="flex flex-col gap-3 rounded-md border border-border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-foreground">{release.name || release.tag}</h2>
        {release.draft ? (
          <Badge variant="outline" size="sm">
            Draft
          </Badge>
        ) : null}
        {release.prerelease ? (
          <Badge variant="outline" size="sm" className="text-tn-yellow">
            Pre-release
          </Badge>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" asChild>
          <a href={release.url} target="_blank" rel="noreferrer">
            <SquareArrowOutUpRight />
            Open on GitHub
          </a>
        </Button>
      </header>
      <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <Tag className="size-4" />
        <span className="text-foreground">{release.tag}</span>
        <Avatar user={release.author} />
        {release.author.login}
        {release.publishedAt ? ` released ${ago(release.publishedAt)}` : ' has not published it yet'}
      </p>
      <Body text={release.body} html={release.html} />
    </article>
  )
}

function NewRelease({ onCreated }: { onCreated(): void }) {
  const { api } = useApp()
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState('')
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [prerelease, setPrerelease] = useState(false)
  const [generateNotes, setGenerateNotes] = useState(true)
  const [sending, setSending] = useState(false)

  const start = () => {
    setTag('')
    setTarget('')
    setName('')
    setBody('')
    setDraft(false)
    setPrerelease(false)
    setGenerateNotes(true)
    setOpen(true)
  }
  const create = async () => {
    setSending(true)
    try {
      const release = await api.github.createRelease({
        tag: tag.trim(),
        target: target.trim(),
        name,
        body,
        draft,
        prerelease,
        generateNotes,
      })
      toast(draft ? `Saved draft ${release.tag}` : `Published ${release.tag}`)
      setOpen(false)
      onCreated()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  const options = [
    {
      id: 'release-notes',
      label: 'Generate release notes from merged pull requests',
      value: generateNotes,
      set: setGenerateNotes,
    },
    { id: 'release-pre', label: 'Mark as a pre-release', value: prerelease, set: setPrerelease },
    { id: 'release-draft', label: 'Save as a draft', value: draft, set: setDraft },
  ]
  return (
    <>
      <Button size="sm" onClick={start}>
        <Plus />
        New release
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle>New release</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (tag.trim()) void create()
            }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="release-tag">Tag</Label>
                <Input
                  id="release-tag"
                  placeholder="v1.2.0"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="release-target">Target, when the tag is new</Label>
                <Input
                  id="release-target"
                  placeholder="Default branch"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </div>
            </div>
            <Input
              aria-label="Release title"
              placeholder="Release title"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <MarkdownEditor
              label="Describe this release"
              placeholder="What changed. Generated notes are added below this."
              value={body}
              onChange={setBody}
              rows={8}
            />
            {options.map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <Checkbox
                  id={option.id}
                  checked={option.value}
                  className={VISIBLE_BOX}
                  onCheckedChange={(next) => option.set(next === true)}
                />
                <Label htmlFor={option.id}>{option.label}</Label>
              </div>
            ))}
            <DialogFooter>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!tag.trim()} loading={sending}>
                {draft ? 'Save draft' : 'Publish release'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function Releases() {
  const { queries } = useApp()
  const ready = isReady(useGitHub())
  const page = useRef<HTMLDivElement>(null)
  useScrollMemory(page, ready ? 'releases' : null)
  const { data: items = null, error, refetch } = useQuery({ ...queries.gh.releases(), enabled: ready })
  const failed = error ? error.message : null
  const load = () => void refetch()

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see releases.</p>
  return (
    <div ref={page} className="h-full overflow-y-auto">
      <div className="flex w-full flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-muted-foreground">
            {items ? `${items.length} ${items.length === 1 ? 'release' : 'releases'}` : null}
          </span>
          <IconTool label="Reload releases" onClick={() => void load()}>
            <RefreshCw />
          </IconTool>
          <NewRelease onCreated={() => void load()} />
        </div>
        {failed ? <p className="text-removed">{failed}</p> : null}
        {!items && !failed ? SKELETONS.map((key) => <Skeleton key={key} className="h-32" />) : null}
        {items?.length === 0 ? (
          <p className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground">
            No releases yet. Publish one from a tag with New release.
          </p>
        ) : null}
        {items?.map((release) => (
          <ReleaseCard key={release.id} release={release} />
        ))}
      </div>
    </div>
  )
}
