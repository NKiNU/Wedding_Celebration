type Props = { status: "uploading" | "posting"; progress: number };

/** Real progress while files go to R2, then "Posting…" for the short server step. */
export function UploadProgress({ status, progress }: Props) {
  const percent = status === "posting" ? 100 : Math.round(progress * 100);
  return (
    <div role="status" className="flex flex-col gap-2">
      <div className="flex justify-between text-[13px]">
        <span className="font-semibold">{status === "posting" ? "Posting…" : "Uploading… keep this page open"}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-soft">
        <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
