import { useSyncExternalStore } from 'react'

/* TRAK-254: a laptop, or a tablet held sideways: wide enough for the coach's side
   menu, and tall enough not to be a phone turned sideways. The same query as the
   side menu in src/index.css; change both together. */
export const SIDE_MENU_QUERY = '(min-width: 1024px) and (min-height: 500px)'

function media() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(SIDE_MENU_QUERY) : null
}

/** True on a screen where a coach's tabs stand in the side menu. Callers check the role. */
export function useSideMenuScreen(): boolean {
  return useSyncExternalStore(
    onChange => {
      const query = media()
      query?.addEventListener?.('change', onChange)
      return () => query?.removeEventListener?.('change', onChange)
    },
    () => media()?.matches ?? false,
    () => false,
  )
}
