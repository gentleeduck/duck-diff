// A full page (a pull request, the inbox, releases, insights) reads in a column of GitHub's width, centred on a
// wide screen; gap is the space between its parts.
export const pageColumn = (gap: string) => ({
  'data-page-column': '',
  className: `mx-auto flex w-full max-w-[1280px] flex-col p-6 ${gap}`,
})

// A pull request or issue: the conversation, then the details column at GitHub's width, a gutter between them.
export const THREAD_GRID = 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-8'
