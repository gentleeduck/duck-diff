import { Tabs, TabsContent, TabsList, TabsTrigger } from '@duck-diff/ui'
import { ChangesTree } from './ChangesTree'
import { HistoryList } from './HistoryList'

// duck-ui hides inactive panels with `hidden`; layout classes go on an inner wrapper so they never override it.
export function Sidebar() {
  return (
    <Tabs defaultValue="changes" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList className="mx-3 mt-3 grid grid-cols-2">
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="changes" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <ChangesTree />
        </div>
      </TabsContent>
      <TabsContent value="history" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <HistoryList />
        </div>
      </TabsContent>
    </Tabs>
  )
}
