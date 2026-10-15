import { Dialog, DialogContent, DialogTitle, Kbd } from '@duck-diff/ui'

const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next or previous change'],
  ['Shift J / Shift K', 'Next or previous file'],
  ['s / u / x', 'Stage, unstage or discard the current change'],
  ['c', 'Comment on the current change'],
  ['v', 'Mark the current file viewed'],
  ['o', 'Open the current change in Neovim'],
  ['t', 'Switch between split and stacked'],
  ['/', 'Filter files'],
  ['1 to 5', 'Changes, graph, files, pull requests, issues'],
  ['Ctrl B', 'Hide or show the left panel'],
  ['Ctrl + / Ctrl - / Ctrl 0', 'Bigger, smaller or default text everywhere'],
  ['Ctrl K', 'Command palette'],
  ['?', 'This list'],
]

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="contents">
              <dt>
                <Kbd>{keys}</Kbd>
              </dt>
              <dd className="text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
