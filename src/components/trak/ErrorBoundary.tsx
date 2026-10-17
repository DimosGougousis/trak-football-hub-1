import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { isStaleBuildError, reloadForNewBuild } from '@/lib/stale-build'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  /** TRAK-192: a screen from the previous release couldn't load. */
  staleBuild?: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, staleBuild: isStaleBuildError(error) }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // TRAK-192: after a deploy, reloading fetches the new release. That isn't
    // a fault; one that comes back straight after a reload is, so report it.
    if (isStaleBuildError(error) && reloadForNewBuild()) return
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (this.state.hasError && this.state.staleBuild) {
      return (
        <div className="mx-auto max-w-[430px] min-h-screen bg-[#0A0A0B] px-5 flex flex-col items-center justify-center gap-4">
          <p className="text-lg text-white/88 font-light">Trak has just been updated</p>
          <p className="text-xs text-white/45 text-center max-w-[280px]">Reload to get the latest version.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-[10px] bg-[#C8F25A] text-black text-sm font-bold active:scale-[0.97] transition-transform"
          >
            Reload
          </button>
        </div>
      )
    }
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="mx-auto max-w-[430px] min-h-screen bg-[#0A0A0B] px-5 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[hsl(0,65%,55%)]/10 flex items-center justify-center">
            <span className="text-2xl">!</span>
          </div>
          <p className="text-lg text-white/88 font-light">Something went wrong</p>
          <p className="text-xs text-white/45 text-center max-w-[280px]">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            className="px-6 py-2.5 rounded-[10px] bg-[#C8F25A] text-black text-sm font-bold active:scale-[0.97] transition-transform"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
