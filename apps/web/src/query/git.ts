import type { DiffTarget, LspQuery } from '@duck-diff/protocol'
import { targetKey } from '@duck-diff/protocol'
import { queryOptions } from '@tanstack/react-query'
import { loadSymbol } from '../code-nav/load-symbol'
import type { SymbolTarget } from '../code-nav/symbol-at'
import type { Api } from '../lib/api'

const CODE_MS = 30_000
const FULL_SHA = /^[0-9a-f]{40}$/
// Something read at a ref changes when refs move; read from the working tree, when files are saved.
const at = (ref: string | null | undefined) => (ref ? (FULL_SHA.test(ref) ? [] : ['refs']) : ['worktree'])

// Every read of the repository itself, tagged with the repo events that make it stale: refs (commits, branch
// moves), index (staging) and worktree (files saved). A commit by its full sha never changes.
export function gitQueries(api: Api) {
  return {
    repo: () => queryOptions({ queryKey: ['git', 'repo'], queryFn: () => api.repo(), meta: { topics: ['refs'] } }),
    refs: () => queryOptions({ queryKey: ['git', 'refs'], queryFn: () => api.refs(), meta: { topics: ['refs'] } }),
    sync: () =>
      queryOptions({ queryKey: ['git', 'sync'], queryFn: () => api.sync(), meta: { topics: ['refs', 'index'] } }),
    remotes: () =>
      queryOptions({ queryKey: ['git', 'remotes'], queryFn: () => api.remotes(), meta: { topics: ['refs'] } }),
    lastMessage: () =>
      queryOptions({ queryKey: ['git', 'last-message'], queryFn: () => api.lastMessage(), meta: { topics: ['refs'] } }),
    commits: (query: { head: string; base?: string; limit?: number; path?: string }) =>
      queryOptions({
        queryKey: ['git', 'commits', query],
        queryFn: () => api.commits(query),
        meta: { topics: ['refs'] },
      }),
    // What a pull request from head into base would carry, as GitHub's compare page shows it.
    compare: (base: string, head: string) =>
      queryOptions({
        queryKey: ['git', 'compare', base, head],
        queryFn: async () => {
          const [commits, files] = await Promise.all([
            api.commits({ head, base, limit: 100 }),
            api.files({ kind: 'range', from: base, to: head, mode: 'merge-base' }),
          ])
          return { commits, files: files.length }
        },
        meta: { topics: ['refs'] },
      }),
    commit: (sha: string) =>
      queryOptions({
        queryKey: ['git', 'commit', sha],
        queryFn: () => api.commit(sha),
        meta: { topics: at(sha), persist: FULL_SHA.test(sha) },
      }),
    commitFiles: (sha: string) =>
      queryOptions({
        queryKey: ['git', 'commit-files', sha],
        queryFn: () => api.files({ kind: 'commit', sha }),
        meta: { topics: at(sha) },
      }),
    commitStat: (sha: string) =>
      queryOptions({
        queryKey: ['git', 'commit-stat', sha],
        queryFn: () => api.commitStat(sha),
        meta: { topics: at(sha) },
      }),
    tree: (ref?: string) =>
      queryOptions({ queryKey: ['git', 'tree', ref ?? null], queryFn: () => api.tree(ref), meta: { topics: at(ref) } }),
    file: (path: string, ref?: string) =>
      queryOptions({
        queryKey: ['git', 'file', path, ref ?? null],
        queryFn: () => api.file(path, ref),
        meta: { topics: at(ref) },
      }),
    blame: (path: string, ref?: string, mergeBase?: string) =>
      queryOptions({
        queryKey: ['git', 'blame', path, ref ?? null, mergeBase ?? null],
        queryFn: () => api.blame(path, ref, mergeBase),
        meta: { topics: mergeBase ? ['refs'] : at(ref) },
      }),
    rebasePlan: (base: string) =>
      queryOptions({
        queryKey: ['git', 'rebase-plan', base],
        queryFn: () => api.rebasePlan(base),
        meta: { topics: ['refs'] },
      }),
    insights: (days: number) =>
      queryOptions({
        queryKey: ['git', 'insights', days],
        queryFn: () => api.insights(days),
        meta: { topics: ['refs'] },
      }),
    worktrees: () =>
      queryOptions({
        queryKey: ['git', 'worktrees'],
        queryFn: () => api.worktrees(),
        meta: { topics: ['refs', 'worktree'] },
      }),
    submodules: () =>
      queryOptions({
        queryKey: ['git', 'submodules'],
        queryFn: () => api.submodules(),
        meta: { topics: ['refs', 'worktree'] },
      }),
    submoduleLog: (path: string, from: string | null, to: string) =>
      queryOptions({
        queryKey: ['git', 'submodule-log', path, from, to],
        queryFn: () => api.submoduleLog(path, from, to),
      }),
    repos: () => queryOptions({ queryKey: ['git', 'repos'], queryFn: () => api.repos(), staleTime: 0 }),
    bisect: () =>
      queryOptions({ queryKey: ['git', 'bisect'], queryFn: () => api.bisect(), meta: { topics: ['refs'] } }),
    conflict: (path: string) =>
      queryOptions({
        queryKey: ['git', 'conflict', path],
        queryFn: () => api.conflict(path),
        meta: { topics: ['index', 'worktree'] },
      }),
    // Code can change under a spot, so answers about it are kept only briefly; clicking back is still instant.
    symbol: (target: SymbolTarget) =>
      queryOptions({
        queryKey: ['git', 'symbol', target.name, target.ref ?? null, target.at ?? null],
        queryFn: () => loadSymbol(api, target),
        staleTime: CODE_MS,
      }),
    hover: (query: LspQuery) =>
      queryOptions({
        queryKey: ['git', 'hover', query],
        queryFn: () => api.lsp.hover(query).catch(() => null),
        staleTime: CODE_MS,
      }),
    reviews: (target: DiffTarget) =>
      queryOptions({
        queryKey: ['git', 'reviews', targetKey(target)],
        queryFn: () => api.reviews(target),
        meta: { topics: ['reviews'] },
      }),
  }
}

export type GitQueries = ReturnType<typeof gitQueries>
