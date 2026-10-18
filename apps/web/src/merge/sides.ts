// The two sides as GitHub names them, each with a colour of its own; the changes inside are red and green.
export const SIDE = {
  ours: {
    label: 'Current change',
    accept: 'Accept current',
    bar: 'bg-tn-blue',
    text: 'text-tn-blue',
    tint: 'bg-tn-blue/10',
  },
  theirs: {
    label: 'Incoming change',
    accept: 'Accept incoming',
    bar: 'bg-tn-magenta',
    text: 'text-tn-magenta',
    tint: 'bg-tn-magenta/10',
  },
} as const

export type Side = keyof typeof SIDE
