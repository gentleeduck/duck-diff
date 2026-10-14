import { Badge } from '@duck-diff/ui'

type Label = { name: string; color: string }

// GitHub label colors are picked for white pages, so they tint the text and border rather than fill.
function LabelBadge({ label }: { label: Label }) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className="max-w-40 shrink-0"
      style={{ color: `#${label.color}`, borderColor: `#${label.color}66`, background: `#${label.color}1f` }}>
      <span className="truncate">{label.name}</span>
    </Badge>
  )
}

// With a limit, the rest collapse into a count so list rows stay one line tall.
export function Labels({ labels, max = labels.length }: { labels: Label[]; max?: number }) {
  const hidden = labels.length - max
  return (
    <>
      {labels.slice(0, max).map((label) => (
        <LabelBadge key={label.name} label={label} />
      ))}
      {hidden > 0 ? (
        <Badge
          variant="outline"
          size="sm"
          className="shrink-0 text-muted-foreground"
          title={labels
            .slice(max)
            .map((label) => label.name)
            .join(', ')}>
          +{hidden}
        </Badge>
      ) : null}
    </>
  )
}
