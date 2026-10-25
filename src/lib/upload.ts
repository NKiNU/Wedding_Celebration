/** No progress for this long (venue wifi that dropped without a reset) and the upload is given up. */
export const STALL_MS = 45_000;

/** PUT a blob to a presigned URL. XHR, not fetch: fetch has no upload progress. */
export function putFile(
  url: string,
  body: Blob,
  mime: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Upload aborted"));

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    let stalled = false;
    let watchdog: ReturnType<typeof setTimeout>;
    const watch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, STALL_MS);
    };
    const done = (error?: Error) => {
      clearTimeout(watchdog);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };

    xhr.open("PUT", url);
    // The server signed the exact Content-Type and Content-Length into the URL; the browser derives the length.
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => {
      watch();
      onProgress(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? done() : done(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => done(new Error("Upload failed (network)"));
    xhr.ontimeout = () => done(new Error("Upload timed out"));
    xhr.onabort = () => done(new Error(stalled ? "Upload stalled" : "Upload aborted"));
    signal?.addEventListener("abort", abort, { once: true });
    watch();
    xhr.send(body);
  });
}
