// A path too long for its row is cut in its folders, and the file's name only once it alone is wider than the row.
export function PathLabel({ path, className = '' }: { path: string; className?: string }) {
  const cut = path.lastIndexOf('/') + 1
  return (
    <span title={path} className={`flex min-w-0 ${className}`}>
      {cut ? <span className="min-w-0 truncate">{path.slice(0, cut)}</span> : null}
      <span className="max-w-full shrink-0 truncate">{path.slice(cut)}</span>
    </span>
  )
}
