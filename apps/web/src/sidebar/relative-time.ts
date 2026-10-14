export function relativeTime(seconds: number, now = Date.now() / 1000): string {
  const elapsed = Math.max(0, now - seconds)
  if (elapsed < 60) return 'just now'
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} h ago`
  const days = Math.floor(elapsed / 86400)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
