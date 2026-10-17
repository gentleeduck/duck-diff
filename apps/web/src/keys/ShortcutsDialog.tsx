import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from '@duck-diff/ui'
import { formatWithLabels } from '@gentleduck/vim/format'
import { SHORTCUTS } from './shortcuts'

const GROUPS = [...new Set(SHORTCUTS.map((shortcut) => shortcut.group))]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(94vw,40rem)] max-w-none flex-col gap-3">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Arrows, Home and End move through any list.</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto pe-1">
          {GROUPS.map((group) => (
            <section key={group} aria-label={group} className="mb-3">
              <h3 className="mb-1 text-tn-magenta">{group}</h3>
              <ul>
                {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <li key={shortcut.id} className="flex min-h-7 items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{shortcut.title}</span>
                    <Kbd>{formatWithLabels(shortcut.keys[0] ?? '', { separator: '+' })}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
