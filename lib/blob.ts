/**
 * Thin wrapper over `@vercel/blob` for the book pipeline artifacts.
 *
 * Responsibilities:
 *   - Upload raw bytes (customer photo, character sheets, page + cover images,
 *     final PDFs) under caller-supplied keys.
 *   - Upload base64 data URLs produced by the image model, extracting the
 *     content type from the `data:<mime>;base64,` prefix.
 *   - Re-read a previously uploaded blob by its public URL (used when the PDF
 *     assembler stitches together pages persisted earlier in the pipeline).
 *   - Delete blobs by pathname (used by the future retention cron that scrubs
 *     customer photos 30+ days after an order completes).
 *
 * All artifacts are uploaded with `access: "public"` because they are served
 * directly to end users — PDFs are linked from order emails and images may be
 * shown in the UI. Keys are passed through verbatim; callers own key hygiene.
 *
 * `BLOB_READ_WRITE_TOKEN` must be present in the environment; if missing,
 * `@vercel/blob` throws its own descriptive error, which we let propagate.
 */

import { put, del } from "@vercel/blob";

interface UploadResult {
  url: string;
  pathname: string;
}

interface UploadBytesOptions {
  contentType?: string;
  addRandomSuffix?: boolean;
  access?: "public";
}

/**
 * Upload a Buffer / Uint8Array to Vercel Blob under the given key.
 * Returns the public URL and pathname of the uploaded blob.
 *
 * When `addRandomSuffix` is false (the pipeline default for deterministic
 * paths like `orders/<id>/p01.png`), Vercel stores the blob at the exact key.
 * When true, Vercel appends a random suffix for cache-busting.
 */
export async function uploadBytes(
  key: string,
  bytes: Buffer | Uint8Array,
  opts: UploadBytesOptions = {},
): Promise<UploadResult> {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const result = await put(key, body, {
    access: "public",
    addRandomSuffix: opts.addRandomSuffix ?? true,
    contentType: opts.contentType,
    // Overwrite is only meaningful for deterministic keys; allow it so the
    // pipeline can safely retry a failed step without cleanup.
    allowOverwrite: opts.addRandomSuffix === false ? true : undefined,
  });
  return { url: result.url, pathname: result.pathname };
}

/**
 * Upload a base64 data URL (e.g. "data:image/png;base64,iVBORw0KGgo...") to
 * Blob. The content type is extracted from the data URL prefix; throws if the
 * input is not a well-formed base64 data URL.
 */
export async function uploadDataUrl(
  key: string,
  dataUrl: string,
  opts: { addRandomSuffix?: boolean } = {},
): Promise<UploadResult> {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error(
      "uploadDataUrl: input is not a valid base64 data URL (expected 'data:<mime>;base64,<payload>')",
    );
  }
  const [, contentType, payload] = match;
  const bytes = Buffer.from(payload, "base64");
  return uploadBytes(key, bytes, {
    contentType,
    addRandomSuffix: opts.addRandomSuffix,
  });
}

/**
 * Fetch a blob's bytes by public URL. Used when reassembling the final PDF
 * from page images that were uploaded earlier in the pipeline (potentially on
 * a different worker invocation).
 */
export async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `fetchBytes: failed to fetch ${url} (${res.status} ${res.statusText})`,
    );
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

/**
 * Delete a blob by pathname. Invoked by the retention cron that removes
 * customer photos 30+ days after an order completes. `del` accepts either a
 * pathname or full URL — we pass through whatever the caller gives us.
 */
export async function deleteBlob(pathname: string): Promise<void> {
  await del(pathname);
}
