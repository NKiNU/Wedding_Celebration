/** Large two-initial monogram (welcome screen). The wireframe theme swaps it for a logo box. */
export function Monogram({ a, b }: { a: string; b: string }) {
  return (
    <>
      <div aria-hidden="true" className="decor relative mt-1.5 h-[150px] w-[200px] font-script leading-none">
        <span className="absolute -top-1.5 left-7 text-[128px]">{a}</span>
        <span className="absolute top-[18px] left-[92px] text-[128px]">{b}</span>
      </div>
      <div
        aria-hidden="true"
        className="wireframe-only my-2.5 h-[120px] w-[140px] items-center justify-center border border-dashed border-line text-xs text-muted"
      >
        Monogram / logo
      </div>
    </>
  );
}
