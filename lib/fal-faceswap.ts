/**
 * Face-restoration pass: swap the face from the approved character sheet
 * onto each rendered page/cover so glasses, freckles, gap teeth, dimples,
 * and other subtle identity features survive to the final frame. The
 * sheet is the identity contract; this makes it the gating artifact
 * for face pixels specifically instead of a soft attention reference
 * inside FLUX's ref bundle.
 *
 * Non-critical path: if the swap fails (no face detected, API hiccup,
 * model returns bad output) we log and ship the unswapped render — the
 * page still gets out the door, just with FLUX's face rather than the
 * sheet's. Orders never block on this step.
 *
 * Opt-in via FACE_SWAP_ENABLED=true so we can flip it off quickly if
 * the output looks wrong on any given story. Model id is FACE_SWAP_MODEL
 * (defaults to fal-ai/face-swap, the InsightFace-based endpoint).
 */
import { fal } from "@fal-ai/client";

const DEFAULT_MODEL = "fal-ai/face-swap";

function model(): string {
  return process.env.FACE_SWAP_MODEL || DEFAULT_MODEL;
}

function ensureConfigured() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY not set");
  fal.config({ credentials: key });
}

async function uploadBuffer(buf: Buffer, filename: string): Promise<string> {
  return fal.storage.upload(
    new File([new Uint8Array(buf)], filename, { type: "image/png" })
  );
}

async function fetchBytes(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`face-swap download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export function faceSwapEnabled(): boolean {
  return process.env.FACE_SWAP_ENABLED?.toLowerCase() === "true";
}

export function faceSwapModel(): string {
  return model();
}

/**
 * Swap the face from `sheetBytes` (source: approved hero sheet) onto
 * `targetBytes` (destination: rendered page or cover). Returns the
 * swapped buffer on success; throws on failure so the caller can
 * decide whether to fall back.
 */
export async function faceSwapFromSheet(params: {
  sheetBytes: Buffer;
  targetBytes: Buffer;
}): Promise<Buffer> {
  ensureConfigured();
  const [sheetUrl, targetUrl] = await Promise.all([
    uploadBuffer(params.sheetBytes, "sheet.png"),
    uploadBuffer(params.targetBytes, "target.png"),
  ]);

  const result = (await fal.subscribe(model(), {
    input: {
      // fal-ai/face-swap canonical shape: base = target (page we want
      // the face swapped INTO), swap = source (the face we want to
      // install — the approved sheet).
      base_image_url: targetUrl,
      swap_image_url: sheetUrl,
    },
    logs: false,
  })) as {
    data?: { image?: { url?: string } };
    image?: { url?: string };
  };

  const url = result.data?.image?.url ?? result.image?.url;
  if (!url) {
    throw new Error(
      `face-swap: no image in response (${JSON.stringify(result).slice(0, 300)})`
    );
  }
  return fetchBytes(url);
}
