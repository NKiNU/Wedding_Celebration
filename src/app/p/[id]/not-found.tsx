import Link from "next/link";

/** A shared link to a post its author has since deleted, or one that was never here. */
export default function PostGone() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
      <h1 className="text-lg font-semibold">This memory is no longer here</h1>
      <p className="text-sm text-muted">The guest who shared it may have deleted it.</p>
      <Link href="/wall" className="mt-4 flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-paper">
        Back to the wall
      </Link>
    </main>
  );
}
