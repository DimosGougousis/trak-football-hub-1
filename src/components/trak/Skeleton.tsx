export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-raised ${className}`} />
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-[14px] bg-surface border border-line p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-1.5 w-full" />
      </div>
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function MatchCardSkeleton() {
  return (
    <div className="rounded-[14px] bg-surface border border-line p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  )
}
