import { cookies } from "next/headers";
import { Suspense } from "react";
import { Floral } from "@/components/decor/Floral";
import { LaceFrame } from "@/components/decor/LaceFrame";
import { WelcomeForm } from "@/components/welcome/WelcomeForm";
import { WelcomeHeader } from "@/components/welcome/WelcomeHeader";
import { nextParam } from "@/lib/validation";
import { getEvent } from "@/server/event";
import { getSession } from "@/server/identity";
import { mediaUrl } from "@/server/wall";

// The decor is the static shell; names and "Continue as" chips stream in per request.
export default function Welcome({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-8 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <LaceFrame />
      <Floral className="absolute -top-1.5 -right-2.5" />
      <Floral full={false} className="absolute -bottom-1.5 -left-2.5 rotate-180" />
      <Suspense>
        <WelcomeContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WelcomeContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [event, session, query] = await Promise.all([getEvent(), getSession(await cookies()), searchParams]);
  const next = nextParam.safeParse(query.next).data;
  return (
    <div className="relative flex w-full max-w-sm flex-col">
      <WelcomeHeader groom={event.groom_name} bride={event.bride_name} monogramUrl={mediaUrl(event.monogram_path)} />
      <WelcomeForm known={session.known} next={next} />
    </div>
  );
}
