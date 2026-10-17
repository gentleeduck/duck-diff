import { Badge } from '@duck-diff/ui'

type Label = { name: string; color: string }

// GitHub label colors are picked for white pages, so they tint the text and border rather than fill;
// round pills shown in full, as GitHub draws them.
export function LabelBadge({ label }: { label: Label }) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className="shrink-0 rounded-full px-2"
      style={{ color: `#${label.color}`, borderColor: `#${label.color}66`, background: `#${label.color}1f` }}>
      {label.name}
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
          variant="muted"
          size="sm"
          className="shrink-0"
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
