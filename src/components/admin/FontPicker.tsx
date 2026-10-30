"use client";

import { useId, useRef } from "react";
import { FONT_OPTIONS, fontVar, type FontKind } from "@/lib/domain/fonts";

type Props = { label: string; value: string; onChange: (key: string) => void; sampleText: string };

const KINDS: readonly { kind: FontKind; heading: string }[] = [
  { kind: "script", heading: "Script" },
  { kind: "serif", heading: "Serif" },
  { kind: "sans", heading: "Sans-serif" },
];

const draw = (key: string) => ({ fontFamily: `var(${fontVar(key)})` });

/**
 * A native <details> of radios. A <select> cannot draw its options in their own font on iOS,
 * and this needs no listbox ARIA or open/close state: the browser owns both.
 */
export function FontPicker({ label, value, onChange, sampleText }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const name = useId();
  const current = FONT_OPTIONS.find((f) => f.key === value);

  // Pointer input only: browsers also fire a click on a radio when an arrow key selects it, and
  // closing then would drop focus mid-list. Pointer-up also covers re-tapping the chosen font.
  const close = () => {
    details.current?.removeAttribute("open");
    summary.current?.focus();
  };

  return (
    <details ref={details} className="group rounded-media bg-soft">
      <summary ref={summary} className="flex min-h-14 cursor-pointer list-none touch-manipulation items-center justify-between gap-3 rounded-media px-4 py-2 active:opacity-80 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="text-xs text-muted">
            {label} · {current?.label ?? value}
          </span>
          <span className="truncate text-lg" style={draw(value)}>
            {sampleText}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 flex-none transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <fieldset className="flex flex-col gap-2 px-2 pb-3">
        <legend className="sr-only">{label}</legend>
        {KINDS.map(({ kind, heading }) => (
          <div key={kind} className="flex flex-col gap-2">
            <p className="px-2 pt-2 text-[13px] font-semibold text-muted">{heading}</p>
            {FONT_OPTIONS.filter((f) => f.kind === kind).map((f) => (
              <label
                key={f.key}
                className="flex min-h-11 cursor-pointer touch-manipulation items-center gap-3 rounded-media bg-card px-3 text-lg active:opacity-80 hover:bg-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                style={draw(f.key)}
                onPointerUp={close}
              >
                <input
                  type="radio"
                  name={name}
                  value={f.key}
                  checked={f.key === value}
                  onChange={() => onChange(f.key)}
                  className="size-5 flex-none accent-ink"
                />
                {f.label}
              </label>
            ))}
          </div>
        ))}
      </fieldset>
    </details>
  );
}
