import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/server/identity";

// ponytail: placeholder so "Start" has somewhere to land; Phase 2 replaces it with the wall.
export default function Wall() {
  return (
    <Suspense>
      <WhoAmI />
    </Suspense>
  );
}

async function WhoAmI() {
  const { active } = await getSession(await cookies());
  if (!active) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-8">
      <p className="text-base">Welcome, {active.name}</p>
    </main>
  );
}
