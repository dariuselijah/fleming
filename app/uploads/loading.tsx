export default function UploadsLoading() {
  return (
    <div className="mx-auto mt-16 w-full max-w-7xl px-4 pb-8 sm:px-6">
      <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs sm:p-8">
        <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
          Knowledge Uploads
        </p>
        <div className="mt-3 h-7 w-56 animate-pulse rounded bg-muted/60" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-muted/50" />
      </div>
      <div className="mt-5 rounded-2xl border border-border/70 bg-background p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
        <div className="mt-3 h-3 w-64 max-w-full animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  )
}
