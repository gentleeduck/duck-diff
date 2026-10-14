import type { FileStatus } from '@duck-diff/protocol'
import {
  Input,
  SidebarContext,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@duck-diff/ui'
import { ChevronRight, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { itemId } from '../lib/items'
import type { SessionState } from '../state/session'
import { filterFiles, type TreeStatus } from './filters'
import { StatusFilter } from './StatusFilter'
import { buildTree, type TreeNode } from './tree'

const selectFiles = (state: SessionState) => state.files

// duck-ui's menu buttons read sidebar state; this panel is always open, so the context is fixed.
const ALWAYS_OPEN = {
  state: 'expanded' as const,
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  isMobile: false,
  toggleSidebar: () => {},
  dir: 'ltr' as const,
}

const LETTER: Record<FileStatus, { letter: string; tone: string }> = {
  added: { letter: 'A', tone: 'text-added' },
  untracked: { letter: 'U', tone: 'text-added' },
  copied: { letter: 'C', tone: 'text-added' },
  modified: { letter: 'M', tone: 'text-warning' },
  'type-changed': { letter: 'T', tone: 'text-warning' },
  conflicted: { letter: '!', tone: 'text-removed' },
  deleted: { letter: 'D', tone: 'text-removed' },
  renamed: { letter: 'R', tone: 'text-muted-foreground' },
}

interface BranchProps {
  nodes: TreeNode[]
  closed: ReadonlySet<string>
  selected: string | null
  onToggle(path: string): void
  onOpen(path: string): void
}

function Branch({ nodes, closed, selected, onToggle, onOpen }: BranchProps) {
  return nodes.map((node) => {
    if (node.kind === 'file') {
      const { letter, tone } = LETTER[node.file.status]
      return (
        <SidebarMenuSubItem key={node.path}>
          <SidebarMenuButton
            size="sm"
            isActive={node.path === selected}
            onClick={() => onOpen(node.path)}
            className="h-7 text-[15px]"
            title={node.path}>
            <FileIcon className="text-muted-foreground" />
            <span className={node.file.status === 'deleted' ? 'line-through' : undefined}>{node.name}</span>
            <span className={`ms-auto ${tone}`}>{letter}</span>
          </SidebarMenuButton>
        </SidebarMenuSubItem>
      )
    }
    const open = !closed.has(node.path)
    const Icon = open ? FolderOpenIcon : FolderIcon
    return (
      <SidebarMenuSubItem key={node.path}>
        <SidebarMenuButton
          size="sm"
          aria-expanded={open}
          onClick={() => onToggle(node.path)}
          className="h-7 text-[15px]"
          title={node.path}>
          <ChevronRight className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          <Icon className="text-muted-foreground" />
          <span>{node.name}</span>
        </SidebarMenuButton>
        {open ? (
          <SidebarMenuSub className="me-0 pe-0">
            <Branch nodes={node.children} closed={closed} selected={selected} onToggle={onToggle} onOpen={onOpen} />
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuSubItem>
    )
  })
}

export function ChangesTree() {
  const { viewer } = useApp()
  const files = useSession(selectFiles)
  const [statuses, setStatuses] = useState<ReadonlySet<TreeStatus>>(new Set())
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const visible = useMemo(() => filterFiles(files, statuses, query), [files, statuses, query])
  const tree = useMemo(() => buildTree(visible), [visible])

  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })
  const open = (path: string) => {
    setSelected(path)
    viewer.current?.scrollTo({ type: 'item', id: itemId(path), align: 'start' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-border border-b p-3">
        <Input
          id="file-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="h-8"
        />
        <StatusFilter files={files} value={statuses} onChange={setStatuses} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length > 0 ? (
          <SidebarContext.Provider value={ALWAYS_OPEN}>
            <SidebarMenu aria-label="Changed files">
              <Branch nodes={tree} closed={closed} selected={selected} onToggle={toggle} onOpen={open} />
            </SidebarMenu>
          </SidebarContext.Provider>
        ) : (
          <p className="p-1 text-[15px] text-muted-foreground">
            {files.length === 0 ? 'No changes in this comparison.' : 'No files match the filter.'}
          </p>
        )}
      </div>
    </div>
  )
}
