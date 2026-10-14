import type { ChangedFile } from '@duck-diff/protocol'
import type { Api } from '../lib/api'

export const PATCH =
  'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n' +
  'diff --git a/b.ts b/b.ts\nindex 3..4 100644\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-c\n+d\n'

export const FILES: ChangedFile[] = ['a.ts', 'b.ts'].map((path) => ({
  path,
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  oldSha: '1',
  newSha: '2',
}))

export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    repo: async () => ({ root: '/r', branch: 'main', head: 'abc1234def' }),
    refs: async () => [],
    commits: async () => [],
    content: async () => null,
    files: async () => FILES,
    diff: async () => new Response(PATCH).body as ReadableStream<Uint8Array>,
    ...overrides,
  }
}
