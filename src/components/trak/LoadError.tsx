import { WifiOff, RefreshCw } from 'lucide-react'

/**
 * Shown when a query failed — never when it succeeded and returned nothing.
 *
 * The distinction matters: every player screen used to discard the error from
 * its Supabase call, so a failed read fell through to the same "no matches
 * yet" copy as a genuinely empty season. A player on a bad connection was told
 * their record did not exist.
 */
export function LoadError({
  what = 'this',
  onRetry,
  retrying = false,
}: {
  what?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  return (
    <div
      className="rounded-[18px] p-5 border text-center"
      style={{ borderColor: 'rgb(var(--t-line))', background: 'rgb(var(--t-raised))' }}
      role="alert"
    >
      <WifiOff size={20} className="mx-auto text-ink-3" />
      <p className="mt-3 text-[13px] text-ink-2">
        {offline ? "You're offline" : "Couldn't connect"}
      </p>
      <p className="mt-1 text-[11px] text-ink-3 leading-relaxed">
        {offline
          ? `We can't load ${what} without a connection. Nothing has been lost.`
          : `We couldn't load ${what} just now. This isn't a change to your record.`}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12px] text-ink-2 border border-line active:bg-raised disabled:opacity-40"
          style={{ fontFamily: 'var(--t-font-mono)' }}
        >
          <RefreshCw size={13} className={retrying ? 'animate-spin' : undefined} />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  )
}
