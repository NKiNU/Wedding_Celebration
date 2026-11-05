import Link from "next/link";

const BAR = "media-loading block rounded-md";

/** The viewer's shape while the post loads: back works at once, bars for author and time, a tile for the photo. */
export function ViewerSkeleton() {
  return (
    <main
      aria-busy="true"
      className="flex h-dvh flex-col bg-viewer pt-[env(safe-area-inset-top)] pb-[max(1.75rem,env(safe-area-inset-bottom))] text-overlay-ink"
    >
      <header className="flex min-h-[60px] items-center gap-1 py-2 pr-2 pl-1">
        <Link href="/wall" aria-label="Back to memories" className="flex size-11 flex-none items-center justify-center rounded-full">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className={`${BAR} h-3.5 w-24`} />
          <span className={`${BAR} h-3 w-36`} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="media-loading aspect-4/5 max-h-full w-full" />
      </div>
      <p className="sr-only" role="status">
        Loading memory…
      </p>
    </main>
  );
}
