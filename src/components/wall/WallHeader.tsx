import { Floral } from "@/components/decor/Floral";
import { initialOf } from "@/lib/domain/names";

type Props = {
  groom: string;
  bride: string;
  headerMessage: string | null;
  memories: number;
  me: string;
  onOpenMe: () => void;
  children?: React.ReactNode; // the latest-wishes ticker
};

/** Wall header. The name chip opens the Me drawer: the guest's posts and Switch name. */
export function WallHeader({ groom, bride, headerMessage, memories, me, onOpenMe, children }: Props) {
  const stat = `${memories} ${memories === 1 ? "memory" : "memories"} shared`;
  return (
    <header className="relative overflow-hidden bg-paper px-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-5">
      <Floral className="absolute -top-[18px] -right-10 size-[210px]" />
      <div className="relative flex h-12 items-center justify-between">
        <span aria-hidden="true" className="font-script text-(length:--mono-size) leading-none font-(weight:--names-weight)">
          {initialOf(groom)}
          {initialOf(bride)}
        </span>
        <button
          type="button"
          onClick={onOpenMe}
          aria-label={`Your name and posts, ${me}`}
          className="flex h-11 items-center gap-2 rounded-full border border-line bg-card pr-2.5 pl-1.5 transition-transform duration-100 active:scale-[0.97]"
        >
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-paper">
            {initialOf(me)}
          </span>
          <span className="max-w-[110px] truncate text-[13px] font-medium">{me}</span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <p className="relative mt-[18px] text-[11px] tracking-[0.2em] text-muted uppercase">The wedding of</p>
      <h1 className="relative mt-0.5 font-script text-(length:--names-size) leading-[1.1] font-(weight:--names-weight)">
        {groom} &amp; {bride}
      </h1>
      <p className="relative mt-1.5 text-[13px] text-muted">{[headerMessage, stat].filter(Boolean).join(" · ")}</p>
      {children}
    </header>
  );
}
