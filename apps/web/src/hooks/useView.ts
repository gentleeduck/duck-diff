import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { View } from '../router/place'

const selectView = (view: View) => view

// Showing a view goes back to where it was left (router/stores.ts).
export function useView(): { view: View; show(view: View): void } {
  const { view: store } = useApp()
  return { view: useStore(store, selectView), show: store.set }
}
