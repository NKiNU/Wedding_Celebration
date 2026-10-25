"use client";

import { useEffect, useRef } from "react";
import type { KnownGuest } from "@/lib/api";
import { useJoin } from "./useJoin";

const CHIP =
  "inline-flex h-11 max-w-full items-center rounded-full border bg-card px-4 text-sm transition-transform duration-100 active:scale-[0.97] data-pending:opacity-60";

export function WelcomeForm({ known }: { known: readonly KnownGuest[] }) {
  const { name, edit, error, suggestions, ready, pending, submit, continueAs } = useJoin(known);
  // Until React hydrates, text typed into the controlled input is discarded and Start would submit
  // the form natively, so the server-rendered form ignores input.
  const busy = pending || !ready;

  // Start was disabled while the request ran, which drops keyboard focus: put it where the fix is.
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) nameField.current?.focus();
  }, [error]);

  return (
    <form onSubmit={submit} className="relative mt-[30px] flex w-full flex-col gap-2.5">
      {known.length > 0 && (
        <section
          aria-labelledby="wm-known"
          className="mb-2 flex flex-col gap-2 rounded-card border border-line bg-card p-3.5 text-left"
        >
          <p id="wm-known" className="text-xs text-muted">
            This phone remembers you
          </p>
          <div className="flex flex-wrap gap-2">
            {known.map((guest) => (
              <button
                key={guest.guestId}
                type="button"
                disabled={busy}
                data-pending={pending || undefined}
                onClick={() => continueAs(guest)}
                className={`${CHIP} border-ink font-medium`}
              >
                <span className="truncate">Continue as {guest.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <label htmlFor="wm-name" className="text-[13px] font-medium">
        Your name
      </label>
      <input
        id="wm-name"
        ref={nameField}
        type="text"
        value={name}
        readOnly={!ready}
        onChange={(e) => edit(e.target.value)}
        placeholder="e.g. Aina from Kajang"
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "wm-name-error" : undefined}
        className={`h-[54px] w-full rounded-full bg-soft px-[22px] text-center text-base text-ink placeholder:text-ink/70 ${error ? "ring-2 ring-ink ring-inset" : ""}`}
      />

      {error && (
        <div id="wm-name-error" role="alert" className="flex flex-col items-center gap-2">
          <p className="flex items-start gap-1.5 text-left text-[13px] font-medium">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="mt-px flex-none"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5v0.5" />
            </svg>
            <span>{error}</span>
          </p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => edit(suggestion)}
                  className={`${CHIP} border-line`}
                >
                  <span className="truncate">Use “{suggestion}”</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        Shown on everything you share. No password: this phone remembers you, so only you can delete
        your posts. We keep only the name you enter.
      </p>
      <button
        type="submit"
        disabled={busy}
        data-pending={pending || undefined}
        className="mt-1.5 h-[54px] rounded-full bg-ink text-[15px] font-semibold tracking-[0.02em] text-paper transition-transform duration-100 active:scale-[0.98] data-pending:opacity-60"
      >
        {pending ? "Starting…" : "Start"}
      </button>
    </form>
  );
}
