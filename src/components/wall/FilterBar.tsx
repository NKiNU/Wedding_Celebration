import { FILTERS, type WallCounts, type WallFilter } from "@/lib/domain/posts";

type Props = { counts: WallCounts; value: WallFilter; onChange: (filter: WallFilter) => void };

/** Sticky pills. Keep every ancestor free of `overflow: hidden`, or sticky stops working. */
export function FilterBar({ counts, value, onChange }: Props) {
  return (
    <nav
      aria-label="Filter memories"
      className="sticky top-0 z-5 flex gap-2 overflow-x-auto border-b border-line bg-paper px-3 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 [scrollbar-width:none]"
    >
      {FILTERS.map(({ id, label }) => {
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(id)}
            className={`flex h-11 flex-none items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-[color,background-color,border-color] duration-150 ${on ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink"}`}
          >
            {label}{" "}
            <span className="text-[11px] opacity-70">{counts[id]}</span>
          </button>
        );
      })}
    </nav>
  );
}
