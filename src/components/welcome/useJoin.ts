"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { api, type ApiResult, type KnownGuest } from "@/lib/api";
import { nameProblem, normalizeName } from "@/lib/domain/names";
import { flagWelcome } from "@/lib/welcome";

const WALL = "/wall";

const subscribeNever = () => () => {};
/** False in server HTML and during hydration, true once React owns the page. */
const useHydrated = () => useSyncExternalStore(subscribeNever, () => true, () => false);

const suggestionsFrom = (details?: Record<string, unknown>): string[] =>
  Array.isArray(details?.suggestions)
    ? details.suggestions.filter((s): s is string => typeof s === "string")
    : [];

/** State and requests behind the welcome form: join with a new name, or continue as a known one. */
export function useJoin(known: readonly KnownGuest[], next?: string) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const ready = useHydrated();

  const edit = (value: string) => {
    setName(value); // never cut a pasted name silently: Start explains when it is too long
    setError("");
    setSuggestions([]);
  };

  async function enter(request: Promise<ApiResult<KnownGuest>>) {
    setRequesting(true);
    const result = await request;
    if (result.ok) {
      // The "Tap + to share" greeting belongs to the wall: a guest sent to a shared post does not get it.
      if (!next) flagWelcome();
      // Stay disabled until the page has rendered; replace so Back does not return to the form.
      startNavigation(() => router.replace(next ?? WALL));
    } else {
      setError(result.error.message);
      setSuggestions(suggestionsFrom(result.error.details));
    }
    setRequesting(false);
  }

  const continueAs = (guest: KnownGuest) =>
    enter(api<KnownGuest>("/api/session", "POST", { guestId: guest.guestId }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeName(name);
    const problem = nameProblem(normalized);
    if (problem) return setError(problem);
    // Typing a name this phone already owns is "Continue as", proven by its token on the server.
    const mine = known.find((k) => k.name.toLowerCase() === normalized.toLowerCase());
    return mine ? continueAs(mine) : enter(api<KnownGuest>("/api/guests", "POST", { name: normalized }));
  }

  return { name, edit, error, suggestions, ready, pending: requesting || navigating, submit, continueAs };
}
