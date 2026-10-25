import { Monogram } from "@/components/ui/Monogram";
import { initialOf as initial } from "@/lib/domain/names";

export function WelcomeHeader({ groom, bride }: { groom: string; bride: string }) {
  return (
    <header className="relative flex w-full flex-col items-center gap-1 text-center">
      <p className="text-[11px] tracking-[0.2em] text-muted uppercase">Share celebration memories of</p>
      <Monogram a={initial(groom)} b={initial(bride)} />
      <h1 className="mt-1 font-script text-(length:--welcome-names-size) leading-[1.15] font-(weight:--names-weight)">
        {groom} &amp; {bride}
      </h1>
    </header>
  );
}
