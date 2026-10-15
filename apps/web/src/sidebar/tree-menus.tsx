import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@duck-diff/ui'
import { Copy, Eye, FileDiff, FileText, History, Minus, Plus, SquareArrowOutUpRight, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WriteKind } from '../viewer/actions'

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast(`Copied the ${what}`)
}

export function CopyItems({ path }: { path: string }) {
  return (
    <>
      <ContextMenuItem onSelect={() => void copy(path, 'path')}>
        <Copy />
        Copy path
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copy(path.split('/').pop() ?? path, 'name')}>
        <Copy />
        Copy name
      </ContextMenuItem>
    </>
  )
}

const WRITE_ITEMS: Record<WriteKind, { label: string; icon: typeof Plus; destructive?: boolean }> = {
  stage: { label: 'Stage file', icon: Plus },
  unstage: { label: 'Unstage file', icon: Minus },
  discard: { label: 'Discard changes', icon: Undo2, destructive: true },
}

// One menu shape for a file anywhere in a tree: what to show it in, what git can do, how to copy it.
export function FileMenu({
  path,
  onOpen,
  openLabel = 'Open',
  onChanges,
  onHistory,
  onNeovim,
  writes = [],
  onWrite,
  onViewed,
}: {
  path: string
  onOpen?(): void
  openLabel?: string
  onChanges?(): void
  onHistory?(): void
  onNeovim?(): void
  writes?: WriteKind[]
  onWrite?(kind: WriteKind): void
  onViewed?(): void
}) {
  return (
    <>
      <ContextMenuLabel>{path}</ContextMenuLabel>
      {onOpen ? (
        <ContextMenuItem onSelect={onOpen}>
          <FileText />
          {openLabel}
        </ContextMenuItem>
      ) : null}
      {onChanges ? (
        <ContextMenuItem onSelect={onChanges}>
          <FileDiff />
          Show changes
        </ContextMenuItem>
      ) : null}
      {onHistory ? (
        <ContextMenuItem onSelect={onHistory}>
          <History />
          File history
        </ContextMenuItem>
      ) : null}
      {onNeovim ? (
        <ContextMenuItem onSelect={onNeovim}>
          <SquareArrowOutUpRight />
          Open in Neovim
        </ContextMenuItem>
      ) : null}
      {onViewed ? (
        <ContextMenuItem onSelect={onViewed}>
          <Eye />
          Toggle viewed
        </ContextMenuItem>
      ) : null}
      {writes.length && onWrite ? <ContextMenuSeparator /> : null}
      {writes.map((kind) => {
        const item = WRITE_ITEMS[kind]
        return (
          <ContextMenuItem key={kind} destructive={item.destructive} onSelect={() => onWrite?.(kind)}>
            <item.icon />
            {item.label}
          </ContextMenuItem>
        )
      })}
      <ContextMenuSeparator />
      <CopyItems path={path} />
    </>
  )
}
