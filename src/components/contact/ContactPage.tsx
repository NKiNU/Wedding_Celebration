import Link from "next/link";

const NAME = "Nik";
const ROLE = "Developer · Wedding apps & custom systems";
const PHONE = "+60 11-3346 0253";
const WHATSAPP = `https://wa.me/601133460253?text=${encodeURIComponent("Hi Nik, I saw the Wedding Memories app and I'm interested.")}`;
const CALL = "tel:+601133460253";
const INSTAGRAM_HANDLE = "@0204.nothim";
const INSTAGRAM = "https://www.instagram.com/0204.nothim";

// Same look as ui/Button, as a link.
const PILL =
  "flex h-[54px] select-none items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-transform duration-100 active:scale-[0.98]";
const ICON = { "aria-hidden": true, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Static advert for the app's developer: WhatsApp or call. Nothing is stored, no guest needed. */
export function ContactPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
        <Link href="/wall" aria-label="Back to memories" className="-ml-2.5 flex size-11 flex-none items-center justify-center rounded-full">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>

        <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-muted uppercase">Contact us</p>
        <h1 className="mt-2 text-[28px] leading-[1.2] font-semibold">Want this app for your wedding?</h1>
        <p className="mt-3 text-[15px] leading-[1.55] text-ink/85">
          Wedding Memories was built by {NAME}. If you&apos;d like it for your own wedding, or need any other system built, get in touch.
        </p>

        <div className="mt-8 flex items-center gap-4 rounded-card border border-line bg-card p-4">
          <span aria-hidden="true" className="flex size-14 flex-none items-center justify-center rounded-full bg-ink text-[22px] font-semibold text-paper">
            {NAME[0]}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[17px] font-semibold">{NAME}</span>
            <span className="text-[13px] text-muted">{ROLE}</span>
            <span className="text-[15px] font-semibold">{PHONE}</span>
            <span className="text-[13px] text-muted">{INSTAGRAM_HANDLE}</span>
          </div>
        </div>

        <div className="flex-1" />

        <div className="mt-8 flex flex-col gap-3">
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className={`${PILL} bg-ink text-paper`}>
            <svg {...ICON}>
              <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20z" />
            </svg>
            Chat on WhatsApp
          </a>
          <a href={CALL} className={`${PILL} bg-soft text-ink`}>
            <svg {...ICON}>
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
            </svg>
            Call {NAME}
          </a>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className={`${PILL} border border-line text-ink`}>
            <svg {...ICON}>
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <path d="M17.5 6.5h.01" />
            </svg>
            Follow on Instagram
          </a>
          <p className="text-center text-xs text-muted">Opens WhatsApp, your phone app or Instagram. Nothing is stored here.</p>
        </div>
      </div>
    </main>
  );
}
