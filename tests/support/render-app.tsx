import { render, type RenderResult } from '@testing-library/react'
import App from '@/App'

/** Renders the real App — providers, router and RouteGuard intact. */
export function renderApp(route: string): RenderResult {
  window.history.pushState({}, '', route)
  return render(<App />)
}
