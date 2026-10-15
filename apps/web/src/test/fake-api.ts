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
    repo: async () => ({ root: '/r', branch: 'main', head: 'abc1234def', nvim: false }),
    refs: async () => [],
    commits: async () => [],
    content: async () => null,
    open: async () => {},
    write: async () => {},
    undo: async () => ({ restored: null }),
    reviews: async () => [],
    createReview: async (input) => ({ ...input, id: 'c1', createdAt: 1, updatedAt: 1 }),
    updateReview: async () => {
      throw new Error('not faked')
    },
    deleteReview: async () => {},
    tree: async () => ['a.ts', 'b.ts'],
    sync: async () => ({ branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, staged: 0, operation: null }),
    git: async () => ({}),
    remotes: async () => [],
    lastMessage: async () => '',
    blame: async () => [],
    github: {
      status: async () => ({ repo: null, user: null, source: null }),
      signIn: async () => ({ repo: null, user: null, source: null }),
      pulls: async () => [],
      list: async () => ({ items: [], total: 0, cursor: null }),
      thread: async () => {
        throw new Error('no threads')
      },
      editThread: async () => {},
      editComment: async () => {},
      deleteComment: async () => {},
      react: async () => {},
      mentions: async () => [],
      references: async () => [],
      createPull: async () => {
        throw new Error('no pull requests')
      },
      defaultBranch: async () => 'main',
      avatars: async () => ({}),
      pull: async () => {
        throw new Error('no pull requests')
      },
      checks: async () => [],
      fetchPull: async () => ({ base: 'main', head: 'main' }),
      comment: async () => {
        throw new Error('no pull requests')
      },
      reviewComment: async () => {
        throw new Error('no pull requests')
      },
      reply: async () => {
        throw new Error('no pull requests')
      },
      review: async () => {},
      merge: async () => {},
      issues: async () => [],
      issue: async () => {
        throw new Error('no issues')
      },
      createIssue: async () => {
        throw new Error('no issues')
      },
      setIssueState: async () => {},
    },
    file: async () => ({ text: 'a\n', size: 2, binary: false }),
    graph: async () => new Response('').body as ReadableStream<Uint8Array>,
    commit: async (sha) => ({
      sha,
      parents: [],
      authorName: 'Duck',
      authorEmail: 'd@x',
      authoredAt: 0,
      committerName: 'Duck',
      committedAt: 0,
      message: 'message',
    }),
    files: async () => FILES,
    diff: async () => new Response(PATCH).body as ReadableStream<Uint8Array>,
    ...overrides,
  }
}
