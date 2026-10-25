"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/**
 * "Switch name": the phone forgets its active name (the guest, their posts and their token stay),
 * then the welcome page loads afresh. `onFail` gets the reason when the server cannot be reached.
 */
export function useSwitchName(onFail: (message: string) => void) {
  const [switching, setSwitching] = useState(false);

  async function switchName() {
    setSwitching(true);
    const result = await api("/api/session", "DELETE");
    // A full load, not a client navigation: the welcome page must read the cookies again to list this
    // name. Replacing the entry keeps Back from returning to a wall this phone no longer signs in to.
    if (result.ok) return window.location.replace("/");
    setSwitching(false);
    onFail(result.error.message);
  }

  return { switching, switchName };
}
