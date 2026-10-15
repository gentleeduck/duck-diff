import type { SecurityAlert } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, SquareArrowOutUpRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'

const TONE: Record<string, string> = {
  critical: 'text-removed border-removed/40',
  high: 'text-removed border-removed/40',
  error: 'text-removed border-removed/40',
  medium: 'text-warning border-warning/40',
  moderate: 'text-warning border-warning/40',
  warning: 'text-warning border-warning/40',
  low: 'text-muted-foreground',
  note: 'text-muted-foreground',
}

// GitHub names the dismissal reasons differently for each kind of alert.
const REASONS: Record<SecurityAlert['kind'], { value: string; label: string }[]> = {
  dependabot: [
    { value: 'tolerable_risk', label: 'Risk is tolerable' },
    { value: 'not_used', label: 'Vulnerable code is not used' },
    { value: 'inaccurate', label: 'Alert is inaccurate' },
    { value: 'no_bandwidth', label: 'No bandwidth to fix' },
    { value: 'fix_started', label: 'A fix has started' },
  ],
  'code-scanning': [
    { value: 'false positive', label: 'False positive' },
    { value: 'used in tests', label: 'Used in tests' },
    { value: "won't fix", label: "Won't fix" },
  ],
}

function Dismiss({ alert, onDone }: { alert: SecurityAlert; onDone(): void }) {
  const { api } = useApp()
  const [reason, setReason] = useState(REASONS[alert.kind][0]?.value ?? '')
  const [busy, setBusy] = useState(false)
  const dismiss = async () => {
    setBusy(true)
    try {
      await api.github.dismissAlert({ kind: alert.kind, number: alert.number, reason })
      toast(`Dismissed alert ${alert.number}`)
      onDone()
    } catch (error) {
      toast.error(`Could not dismiss it: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          Dismiss
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <Select value={reason} onValueChange={(next: string) => next && setReason(next)}>
          <SelectTrigger aria-label="Reason" className="h-7 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONS[alert.kind].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="self-end" loading={busy} onClick={() => void dismiss()}>
          Dismiss alert
        </Button>
      </PopoverContent>
    </Popover>
  )
}

// Dependabot and code scanning alerts, open ones only, each readable and dismissable here.
export function Security() {
  const { queries } = useApp()
  const ready = isReady(useGitHub())
  const { data: found = null, error, refetch } = useQuery({ ...queries.gh.security(), enabled: ready })
  const failed = error ? error.message : null
  const load = () => void refetch()

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see security alerts.</p>
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex w-full flex-col gap-3 p-6">
        {failed ? <p className="text-removed">{failed}</p> : null}
        {!found && !failed ? ['a', 'b', 'c'].map((key) => <Skeleton key={key} className="h-14" />) : null}
        {found?.unavailable.map((entry) => (
          <p key={entry.kind} className="rounded-md border border-border border-dashed px-4 py-2 text-muted-foreground">
            {entry.kind === 'dependabot' ? 'Dependabot' : 'Code scanning'} alerts could not be read: {entry.reason}
          </p>
        ))}
        {found && !found.alerts.length && found.unavailable.length < 2 ? (
          <p className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground">
            No open alerts.
          </p>
        ) : null}
        {found?.alerts.length ? (
          <ul aria-label="Security alerts" className="divide-y divide-border rounded-md border border-border">
            {found.alerts.map((alert) => (
              <li key={`${alert.kind}:${alert.number}`} className="flex items-center gap-3 px-4 py-2">
                <ShieldAlert className="size-4 shrink-0 text-removed" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-foreground">{alert.summary || alert.subject}</span>
                  <span className="truncate text-muted-foreground">
                    {alert.kind === 'dependabot' ? 'Dependabot' : 'Code scanning'} #{alert.number} on {alert.subject}
                    {alert.path ? ` in ${alert.path}` : ''}, opened {ago(alert.createdAt)}
                  </span>
                </span>
                <Badge variant="outline" size="sm" className={TONE[alert.severity] ?? ''}>
                  {alert.severity}
                </Badge>
                <Button size="sm" variant="ghost" asChild>
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open alert ${alert.number} on GitHub`}>
                    <SquareArrowOutUpRight />
                  </a>
                </Button>
                <Dismiss alert={alert} onDone={() => void load()} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
