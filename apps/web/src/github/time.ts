import { relativeTime } from '../sidebar/relative-time'

export const ago = (iso: string) => relativeTime(Date.parse(iso) / 1000)
