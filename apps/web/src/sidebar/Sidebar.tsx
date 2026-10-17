import { Tabs, TabsContent, TabsList, TabsTrigger } from '@duck-diff/ui'
import { useEffect } from 'react'
import { useApp } from '../app/AppProvider'
import { describeTarget } from '../compare/model'
import { CommitBox } from '../git/CommitBox'
import { StagePanel } from '../git/StagePanel'
import { useTarget } from '../hooks/useTarget'
import { useKept } from '../lib/kept'
import { ChangesTree } from './ChangesTree'
import { HistoryList } from './HistoryList'

// duck-ui hides inactive panels with `hidden`; layout classes go on an inner wrapper so they never override it.
export function Sidebar() {
  const { fileHistory } = useApp()
  const { target } = useTarget()
  const [tab, setTab] = useKept('sidebar-tab', 'changes')
  const targetPath = describeTarget(target).path

  // Asking for a file's history, or opening a link to one file, shows that file's log.
  useEffect(() => fileHistory.subscribe(() => fileHistory.get() && setTab('history')), [fileHistory, setTab])
  useEffect(() => {
    if (targetPath && fileHistory.get() !== targetPath) fileHistory.set(targetPath)
  }, [targetPath, fileHistory])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 mt-3 grid w-auto grid-cols-3 [&>*]:w-full">
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="stage">Stage</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="changes" renderOnce className="mt-0 min-h-0 flex-1">
          <div className="flex h-full flex-col">
            <ChangesTree />
          </div>
        </TabsContent>
        <TabsContent value="stage" renderOnce className="mt-0 min-h-0 flex-1">
          <div className="flex h-full flex-col">
            <StagePanel />
          </div>
        </TabsContent>
        <TabsContent value="history" renderOnce className="mt-0 min-h-0 flex-1">
          <div className="flex h-full flex-col">
            <HistoryList />
          </div>
        </TabsContent>
      </Tabs>
      <CommitBox />
    </div>
  )
}
