import { Suspense } from "react";
import { WallContent } from "./WallContent";

export default function WallPage() {
  return (
    <Suspense>
      <WallContent />
    </Suspense>
  );
}
