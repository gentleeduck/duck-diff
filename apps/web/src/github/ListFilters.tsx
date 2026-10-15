import type { ListQuery } from '@duck-diff/protocol'
import { ChevronDown, Milestone, UserX } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { useApp } from '../app/AppProvider'
import { Avatar } from './Conversation'
import { type Choice, Picker } from './Picker'
import { options } from './SidebarEditors'
import { setQualifier, toggleQualifier, tokens, valuesOf } from './search-query'

const SORTS: { value: ListQuery['sort']; label: string }[] = [
  { value: 'created', label: 'Newest' },
  { value: 'created-asc', label: 'Oldest' },
  { value: 'comments', label: 'Most commented' },
  { value: 'comments-asc', label: 'Least commented' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'updated-asc', label: 'Least recently updated' },
]

// Review filters are whole qualifiers of different kinds, so each choice is the token itself.
const REVIEWS: Choice[] = [
  { value: 'review:none', label: 'No reviews' },
  { value: 'review:required', label: 'Review required' },
  { value: 'review:approved', label: 'Approved review' },
  { value: 'review:changes_requested', label: 'Changes requested' },
  { value: 'reviewed-by:@me', label: 'Reviewed by you' },
  { value: '-reviewed-by:@me', label: 'Not reviewed by you' },
  { value: 'review-requested:@me', label: 'Awaiting review from you' },
]

// The header's text menus, as GitHub has them: a word and a caret, brighter while it filters.
const MenuButton = forwardRef<HTMLButtonElement, { label: string; active: boolean }>(function MenuButton(
  { label, active, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={`flex cursor-pointer items-center gap-1 hover:text-foreground ${active ? 'text-tn-blue' : 'text-muted-foreground'}`}>
      {label}
      <ChevronDown className="size-4" />
    </button>
  )
})

export function ListFilters({
  kind,
  query,
  onQuery,
  sort,
  onSort,
}: {
  kind: ListQuery['kind']
  query: string
  onQuery(next: string): void
  sort: ListQuery['sort']
  onSort(next: ListQuery['sort']): void
}) {
  const app = useApp()
  const people = async (): Promise<Choice[]> =>
    (await options(app)).people.map((user) => ({ value: user.login, label: user.login, icon: <Avatar user={user} /> }))
  const single = (key: string) => (next: string[]) => onQuery(setQualifier(query, key, next[0] ?? null))
  const menu = (title: string, label: string, active: boolean, picker: (trigger: ReactNode) => ReactNode) =>
    picker(<MenuButton label={label} active={active} aria-label={`Filter by ${title.toLowerCase()}`} />)

  const reviewNow = tokens(query).filter((token) => REVIEWS.some((choice) => choice.value === token))
  return (
    <div className="ms-auto flex flex-wrap items-center gap-4">
      {menu('Author', 'Author', valuesOf(query, 'author').length > 0, (trigger) => (
        <Picker
          title="Filter by author"
          trigger={trigger}
          single
          live
          load={people}
          selected={valuesOf(query, 'author')}
          onApply={single('author')}
        />
      ))}
      {menu('Label', 'Label', valuesOf(query, 'label').length > 0, (trigger) => (
        <Picker
          title="Filter by label"
          trigger={trigger}
          live
          load={async () =>
            (await options(app)).labels.map((entry) => ({
              value: entry.name,
              label: entry.name,
              detail: entry.description || undefined,
              icon: <span className="size-3 shrink-0 rounded-full" style={{ background: `#${entry.color}` }} />,
            }))
          }
          selected={valuesOf(query, 'label')}
          onApply={(next) => {
            const before = valuesOf(query, 'label')
            const changed = [
              ...next.filter((name) => !before.includes(name)),
              ...before.filter((name) => !next.includes(name)),
            ]
            onQuery(changed.reduce((text, name) => toggleQualifier(text, 'label', name), query))
          }}
        />
      ))}
      {menu('Milestone', 'Milestones', valuesOf(query, 'milestone').length > 0, (trigger) => (
        <Picker
          title="Filter by milestone"
          trigger={trigger}
          single
          live
          load={async () =>
            (await options(app)).milestones.map((entry) => ({
              value: entry.title,
              label: entry.title,
              icon: <Milestone className="size-4 shrink-0" />,
            }))
          }
          selected={valuesOf(query, 'milestone')}
          onApply={single('milestone')}
        />
      ))}
      {kind === 'pr'
        ? menu('Reviews', 'Reviews', reviewNow.length > 0, (trigger) => (
            <Picker
              title="Filter by review"
              trigger={trigger}
              single
              live
              load={async () => REVIEWS}
              selected={reviewNow}
              onApply={(next) => {
                const kept = tokens(query).filter((token) => !REVIEWS.some((choice) => choice.value === token))
                onQuery([...kept, ...next].join(' '))
              }}
            />
          ))
        : null}
      {menu(
        'Assignee',
        'Assignee',
        valuesOf(query, 'assignee').length > 0 || /\bno:assignee\b/.test(query),
        (trigger) => (
          <Picker
            title="Filter by assignee"
            trigger={trigger}
            single
            live
            load={async () => [
              { value: 'no:assignee', label: 'Assigned to nobody', icon: <UserX className="size-4 shrink-0" /> },
              ...(await people()),
            ]}
            selected={/\bno:assignee\b/.test(query) ? ['no:assignee'] : valuesOf(query, 'assignee')}
            onApply={(next) => {
              const cleared = setQualifier(query, 'assignee', null)
                .split(' ')
                .filter((token) => token !== 'no:assignee')
                .join(' ')
              const pick = next[0]
              onQuery(
                !pick
                  ? cleared
                  : pick === 'no:assignee'
                    ? `${cleared} no:assignee`.trim()
                    : setQualifier(cleared, 'assignee', pick),
              )
            }}
          />
        ),
      )}
      {menu('Sort', 'Sort', sort !== 'updated', (trigger) => (
        <Picker
          title="Sort by"
          trigger={trigger}
          single
          live
          load={async () => SORTS.map((entry) => ({ value: entry.value, label: entry.label }))}
          selected={[sort]}
          onApply={(next) => onSort((next[0] as ListQuery['sort'] | undefined) ?? 'updated')}
        />
      ))}
    </div>
  )
}
