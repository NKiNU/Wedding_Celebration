"use client";

import { useEffect, useState } from "react";

/**
 * The couple's QR as a `File`, fetched when the drawer opens. Sharing has to start inside the tap
 * that asks for it, and iOS drops that permission across a `fetch`, so the bytes are ready first.
 */
export function useQrFile(open: boolean, available: boolean) {
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open || !available) return;
    let stale = false;
    fetch("/qr")
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (stale || !blob) return;
        setFile(new File([blob], `duitnow-qr.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }));
      })
      .catch(() => {}); // the plain download link below still works
    return () => {
      stale = true;
      setFile(null); // never offer the previous QR while the current one loads
    };
  }, [open, available]);

  return file;
}
