import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
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
