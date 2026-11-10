const SKELETON_ROWS = 5;

export function OrderHistorySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading orders…</span>
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="card space-y-3 p-6">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}
