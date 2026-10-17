import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { lazy, Suspense } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { ErrorBoundary } from '@/components/trak/ErrorBoundary'
import { isStaleBuildError, page, reloadForNewBuild, forgetStaleBuildReload } from '@/lib/stale-build'

/**
 * TRAK-192: after a deploy, an open tab asks for a lazy screen file from the
 * old release. Vercel answers with index.html, so the browser refuses it and
 * the coach or parent saw "Something went wrong" with the raw message. Sentry,
 * 7 days to 17 Oct: 23 events across these messages. Trak now reloads once by
 * itself; a second failure within 30 s says so in plain words.
 */

// The boundary reports to Sentry; count those calls without sending anything.
const capture = vi.hoisted(() => vi.fn())
vi.mock('@sentry/react', () => ({ captureException: capture }))

const STALE = [
  "'text/html' is not a valid JavaScript MIME type.", // Safari
  "'text/html' is not a valid JavaScript MIME type for module script 'https://trakfootball.com/assets/ParentHome-NwfYLLcO.js'.",
  'Importing a module script failed.', // Safari
  'Failed to fetch dynamically imported module: https://trakfootball.com/assets/ParentEvent-DWv87pkt.js', // Chrome
  'error loading dynamically imported module: https://trakfootball.com/assets/Settings-a1.js', // Firefox
]

let reloads: number
beforeEach(() => {
  reloads = 0
  page.reload = () => { reloads++ }
  sessionStorage.clear()
  forgetStaleBuildReload()
  capture.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

/** A lazy screen whose file is gone: its import rejects with `message`. */
function MissingScreen({ message }: { message: string }) {
  const Screen = lazy(() => Promise.reject(new TypeError(message)))
  return <ErrorBoundary><Suspense fallback={null}><Screen /></Suspense></ErrorBoundary>
}

describe('TRAK-192: which errors mean "a new release is out"', () => {
  it.each(STALE)('%s', message => expect(isStaleBuildError(new TypeError(message))).toBe(true))

  it('an ordinary error is not one', () => {
    expect(isStaleBuildError(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false)
    expect(isStaleBuildError('nope')).toBe(false)
  })
})

describe('TRAK-192: reload once, never in a loop', () => {
  it('reloads the first time, and only once for this page', () => {
    expect(reloadForNewBuild()).toBe(true)
    expect(reloadForNewBuild()).toBe(true)
    expect(reloads).toBe(1)
  })

  it('a second failure within 30 s of the last reload does not reload again', () => {
    sessionStorage.setItem('trak:stale-build-reload', String(Date.now() - 10_000))
    expect(reloadForNewBuild()).toBe(false)
    expect(reloads).toBe(0)
  })

  it('after 30 s it may reload again', () => {
    sessionStorage.setItem('trak:stale-build-reload', String(Date.now() - 31_000))
    expect(reloadForNewBuild()).toBe(true)
    expect(reloads).toBe(1)
  })

  it('with no storage it never auto-reloads', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(reloadForNewBuild()).toBe(false)
    expect(reloads).toBe(0)
  })
})

describe('TRAK-192: what the coach or parent sees', () => {
  it.each(STALE)('a screen missing after a release (%s) reloads, with plain words and no technical text', async message => {
    render(<MissingScreen message={message} />)
    expect(await screen.findByText('Trak has just been updated')).toBeInTheDocument()
    expect(screen.queryByText(message)).toBeNull()
    expect(screen.queryByText('Something went wrong')).toBeNull()
    await waitFor(() => expect(reloads).toBe(1))
    // A reload that fixes it isn't a fault to report.
    expect(capture).not.toHaveBeenCalled()
  })

  it('if it fails again straight after a reload, it offers Reload and reports it', async () => {
    sessionStorage.setItem('trak:stale-build-reload', String(Date.now() - 5_000))
    render(<MissingScreen message="Importing a module script failed." />)
    expect(await screen.findByText('Trak has just been updated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(reloads).toBe(0)
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('any other error is shown and reported exactly as before', async () => {
    render(<MissingScreen message="Cannot read properties of undefined (reading 'id')" />)
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText("Cannot read properties of undefined (reading 'id')")).toBeInTheDocument()
    expect(reloads).toBe(0)
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
