export function relativeTime(seconds: number, now = Date.now() / 1000): string {
  const elapsed = Math.max(0, now - seconds)
  if (elapsed < 60) return 'just now'
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} h ago`
  const days = Math.floor(elapsed / 86400)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

// The same, in a few characters, for narrow columns such as blame.
export function shortAge(seconds: number, now = Date.now() / 1000): string {
  const elapsed = Math.max(0, now - seconds)
  if (elapsed < 60) return 'now'
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`
  const days = Math.floor(elapsed / 86400)
  if (days < 60) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}
