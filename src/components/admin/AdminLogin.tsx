"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "./Field";
import { useAdminLogin } from "./useAdminLogin";

export function AdminLogin() {
  const [passcode, setPasscode] = useState("");
  const { login, pending, error } = useAdminLogin();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-6 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void login(passcode);
        }}
      >
        <Field
          label="Passcode"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-[13px] font-medium">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending || passcode === ""}>
          {pending ? "Checking…" : "Enter"}
        </Button>
      </form>
    </main>
  );
}
