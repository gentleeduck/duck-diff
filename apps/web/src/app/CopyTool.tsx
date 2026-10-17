import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { IconTool } from './IconTool'

// A copy shows on the button that made it: a check on a light green ground for a moment.
export const COPIED = 'bg-added/15! text-added! hover:bg-added/20!'

export function useCopy(ms = 1500) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async (text: string | (() => Promise<string>)) => {
    try {
      await navigator.clipboard.writeText(typeof text === 'string' ? text : await text())
    } catch (error) {
      toast.error('Could not copy', { description: (error as Error).message })
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), ms)
  }
  return { copied, copy }
}

// The 28px copy button; text can be a function for text that has to be fetched first.
export function CopyTool({ label, text }: { label: string; text: string | (() => Promise<string>) }) {
  const { copied, copy } = useCopy()
  return (
    <IconTool
      label={label}
      tip={copied ? 'Copied' : label}
      className={copied ? COPIED : undefined}
      onClick={() => void copy(text)}>
      {copied ? <Check /> : <Copy />}
    </IconTool>
  )
}
