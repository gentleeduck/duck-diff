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
    jobs: async () => [],
    jobOutput: async () => '',
    terminals: async () => [],
    closeTerminal: async () => {},
    clearCache: async () => {},
    remotes: async () => [],
    lastMessage: async () => '',
    symbols: async (name) => ({ name, hits: [], truncated: false }),
    rebasePlan: async () => [],
    commitStat: async () => ({ files: 0, additions: 0, deletions: 0 }),
    insights: async () => ({ total: 0, contributors: [], weeks: [] }),
    worktrees: async () => [],
    submodules: async () => [],
    submoduleLog: async () => [],
    openRepo: async () => 'http://127.0.0.1:1/',
    repos: async () => [{ path: '/r', name: 'r', current: true }],
    addRepo: async (path) => path,
    removeRepo: async () => {},
    tcd: async () => {},
    bisect: async () => ({ active: false, bad: false, good: 0, remaining: null, culprit: null, log: '' }),
    conflict: async (path) => ({
      path,
      eol: '\n',
      finalNewline: true,
      segments: [],
      stages: { base: null, ours: null, theirs: null },
    }),
    lsp: {
      definition: async () => ({ source: null, server: null, locations: [] }),
      references: async () => ({ source: null, server: null, locations: [] }),
      hover: async () => ({ source: null, server: null, contents: null }),
    },
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
      options: async () => ({ labels: [], milestones: [], people: [], teams: [] }),
      requestReviewers: async () => {},
      setPullState: async () => {},
      setDraft: async () => {},
      setLocked: async () => {},
      extras: async () => ({ subscription: 'UNSUBSCRIBED' as const, pinned: null, projects: [], linked: [] }),
      setSubscribed: async () => {},
      setPinned: async () => {},
      applySuggestions: async () => {},
      mergeInfo: async () => ({
        methods: ['squash', 'merge', 'rebase'] as ('merge' | 'squash' | 'rebase')[],
        defaultMethod: 'squash' as const,
        autoMergeAllowed: true,
        deleteBranchOnMerge: false,
        reviewDecision: null,
        requiredApprovals: null,
        mergeState: 'CLEAN',
        canMergeAsAdmin: false,
        autoMerge: null,
        squashTitle: 'COMMIT_OR_PR_TITLE' as const,
        squashMessage: 'COMMIT_MESSAGES' as const,
        mergeTitle: 'MERGE_MESSAGE' as const,
        mergeMessage: 'PR_TITLE' as const,
      }),
      transfer: async () => {
        throw new Error('no transfer')
      },
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
      pullCommits: async () => [],
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
      reviewState: async () => ({ threads: [], viewed: [] }),
      resolveThread: async () => {},
      setViewed: async () => {},
      updateBranch: async () => {},
      setAutoMerge: async () => {},
      setHeadBranch: async () => {},
      setBase: async () => {},
      rerunFailed: async () => {},
      notifications: async () => [],
      markRead: async () => {},
      releases: async () => [],
      discussions: async () => [],
      discussion: async () => {
        throw new Error('no discussion')
      },
      replyDiscussion: async () => {},
      markAnswer: async () => {},
      security: async () => ({ alerts: [], unavailable: [] }),
      dismissAlert: async () => {},
      mergeQueue: async () => ({ enabled: false, position: null, state: null }),
      setQueued: async () => {},
      createRelease: async () => {
        throw new Error('no releases')
      },
      runs: async () => [],
      runAction: async () => {},
      jobLog: async () => '',
      merge: async () => {},
      issues: async () => [],
      issue: async () => {
        throw new Error('no issues')
      },
      templates: async () => ({ issue: [], pull: null }),
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
