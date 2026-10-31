import { useId } from "react";

type Props = Omit<React.ComponentProps<"input">, "id"> & { label: string; hint?: string };

/** A labelled text input; 16 px text so iOS does not zoom on focus. */
export function Field({ label, hint, className = "", ...input }: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`h-12 w-full rounded-full bg-soft px-5 text-base text-ink ${className}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** One titled block of the admin screen. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-card bg-card p-5 [border:var(--card-border)] [box-shadow:var(--card-shadow)]">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
