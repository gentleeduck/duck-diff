export interface RefLabel {
  name: string
  kind: 'head' | 'branch' | 'remote' | 'tag'
  current: boolean
}

export interface GraphEntry {
  sha: string
  parents: string[]
  refs: RefLabel[]
  author: string
  email: string
  time: number
  subject: string
}

// `%D` decorations: "HEAD -> main, origin/main, tag: v1.0". origin/HEAD only repeats another ref, so it is dropped.
export function parseRefs(decorations: string, remotes: ReadonlySet<string>): RefLabel[] {
  const refs: RefLabel[] = []
  for (const part of decorations.split(', ').filter(Boolean)) {
    if (part.startsWith('HEAD -> ')) refs.push({ name: part.slice(8), kind: 'branch', current: true })
    else if (part === 'HEAD') refs.push({ name: 'HEAD', kind: 'head', current: true })
    else if (part.startsWith('tag: ')) refs.push({ name: part.slice(5), kind: 'tag', current: false })
    else if (part.endsWith('/HEAD')) continue
    else refs.push({ name: part, kind: remotes.has(part) ? 'remote' : 'branch', current: false })
  }
  return refs
}

// Records end with a record separator and may arrive split across chunks.
export function createRecordReader(onEntry: (entry: GraphEntry) => void, remotes: ReadonlySet<string>) {
  let buffer = ''
  const emit = (record: string) => {
    const [sha = '', parents = '', refs = '', author = '', email = '', time = '0', subject = ''] = record
      .replace(/^\n/, '')
      .split('\x1f')
    if (!sha) return
    onEntry({
      sha,
      parents: parents ? parents.split(' ') : [],
      refs: parseRefs(refs, remotes),
      author,
      email,
      time: Number(time),
      subject,
    })
  }
  return {
    push(chunk: string) {
      buffer += chunk
      let end = buffer.indexOf('\x1e')
      while (end !== -1) {
        emit(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        end = buffer.indexOf('\x1e')
      }
    },
    finish() {
      if (buffer.trim()) emit(buffer)
      buffer = ''
    },
  }
}
