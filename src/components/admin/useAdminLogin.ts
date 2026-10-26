"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

/** Sends the passcode; on success the server page re-renders as the dashboard. */
export function useAdminLogin() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(passcode: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await api("/api/admin/session", "POST", { passcode });
    if (result.ok) router.refresh();
    else {
      setError(result.error.message);
      setPending(false);
    }
  }

  async function logout() {
    await api("/api/admin/session", "DELETE");
    router.refresh();
  }

  return { login, logout, pending, error };
}
