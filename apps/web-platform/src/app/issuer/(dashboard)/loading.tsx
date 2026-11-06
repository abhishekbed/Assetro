export default function IssuerDashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Header Bar Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-lg bg-surface-header" />
          <div className="h-4 w-80 rounded-md bg-surface-header/60" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-surface-header/80" />
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-surface-header" />
              <div className="h-8 w-8 rounded-lg bg-surface-header" />
            </div>
            <div className="h-8 w-32 rounded-md bg-surface-header/80" />
            <div className="h-3 w-16 rounded bg-surface-header/50" />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="h-5 w-44 rounded bg-surface-header" />
          <div className="h-8 w-28 rounded-lg bg-surface-header" />
        </div>
        <div className="space-y-3 pt-2">
          <div className="h-16 w-full rounded-xl bg-surface-header/50" />
          <div className="h-16 w-full rounded-xl bg-surface-header/40" />
          <div className="h-16 w-full rounded-xl bg-surface-header/30" />
        </div>
      </div>
    </div>
  );
}
