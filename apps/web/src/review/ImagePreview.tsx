import { type ChangedFile, encodeTarget } from '@duck-diff/protocol'
import { useTarget } from '../hooks/useTarget'

function blobUrl(target: string, side: 'old' | 'new', file: ChangedFile): string {
  const params = new URLSearchParams({ side, path: file.path })
  if (file.oldPath) params.set('oldPath', file.oldPath)
  return `/api/blob?target=${target}&${params}`
}

export function ImagePreview({ file }: { file: ChangedFile }) {
  const { target } = useTarget()
  const encoded = encodeTarget(target)
  const sides = [
    { side: 'old' as const, label: 'Before', present: file.status !== 'added' && file.status !== 'untracked' },
    { side: 'new' as const, label: 'After', present: file.status !== 'deleted' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 p-3 font-sans">
      {sides.map(({ side, label, present }) => (
        <figure key={side} className="flex flex-col gap-1.5">
          <figcaption className="text-[12px] text-muted-foreground">{label}</figcaption>
          {present ? (
            <img
              src={blobUrl(encoded, side, file)}
              alt={`${file.path}, ${label.toLowerCase()}`}
              className="max-h-80 w-fit max-w-full rounded-md border border-border bg-[repeating-conic-gradient(var(--border)_0_25%,transparent_0_50%)] bg-[length:16px_16px] object-contain"
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">{side === 'old' ? 'New file' : 'Deleted'}</p>
          )}
        </figure>
      ))}
    </div>
  )
}
