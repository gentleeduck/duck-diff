import { useEffect, useState } from 'react'

// The value once it has stopped changing for a moment, so racing through a list reads only where it stops.
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
