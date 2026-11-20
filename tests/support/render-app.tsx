import { render, type RenderResult } from '@testing-library/react'
import App from '@/App'

/** Renders the real App — providers, router and RouteGuard intact. */
export function renderApp(route: string): RenderResult {
  window.history.pushState({}, '', route)
  return render(<App />)
}

/** Renders the App at `route` with the router state a button would have passed (`navigate(route, { state })`).
 *  TRAK-499: no button leads into the old log pages any more; they still open from their addresses. */
export function renderAppWithState(route: string, state: unknown): RenderResult {
  window.history.pushState({ usr: state, key: 'test', idx: 0 }, '', route)
  return render(<App />)
}
