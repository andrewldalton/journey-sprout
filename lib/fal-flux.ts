/**
 * FLUX.1 Kontext Pro provider via Fal.ai — same interface as lib/gemini.ts
 * and lib/vertex-imagen.ts so lib/image-gen.ts can swap between them.
 *
 * Why FLUX Kontext Pro: Black Forest Labs' model specifically designed for
 * multi-turn subject preservation. Meant to keep a real child consistent
 * across a 12-render book — much tighter identity lock than Gemini's soft
 * lock, without needing a per-order LoRA training pass.
 *
 * Sheet generation uses the single-ref endpoint (photo → painted sheet).
 * Page + cover generation use the multi-ref endpoint (hero sheet + photo +
 * companion + settings collapsed into one reference bundle).
 *
 * Auth: FAL_KEY env var (get one at https://fal.ai/dashboard/keys).
 *
 * Endpoint ids reflect Fal.ai's catalog as of 2026-04. If they're renamed,
 * update the MODEL_* constants — the payload shape is stable.
 */
import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";

const MODEL_SINGLE = "fal-ai/flux-pro/kontext";
const MODEL_MULTI = "fal-ai/flux-pro/kontext/multi";

type ImgRef =
  | { type: "file"; path: string }
  | { type: "buffer"; bytes: Buffer; mimeType?: string }
  | { type: "dataUrl"; dataUrl: string };

function ensureConfigured() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY not set");
  fal.config({ credentials: key });
}

function mimeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg";
}

async function uploadRef(ref: ImgRef): Promise<string> {
  if (ref.type === "file") {
    const bytes = fs.readFileSync(ref.path);
    return fal.storage.upload(
      new File([new Uint8Array(bytes)], path.basename(ref.path), { type: mimeFor(ref.path) })
    );
  }
  if (ref.type === "buffer") {
    return fal.storage.upload(
      new File([new Uint8Array(ref.bytes)], "ref.png", { type: ref.mimeType || "image/png" })
    );
  }
  const m = ref.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!m) throw new Error("fal-flux: invalid base64 data URL");
  const bytes = Buffer.from(m[2], "base64");
  return fal.storage.upload(new File([new Uint8Array(bytes)], "ref.bin", { type: m[1] }));
}

async function fetchBytes(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

type FalKontextResult = {
  images?: { url?: string; content_type?: string; width?: number; height?: number }[];
  data?: { images?: { url?: string }[] };
};

type AspectRatio = "1:1" | "21:9" | "16:9" | "4:3" | "3:2" | "2:3" | "3:4" | "9:16" | "9:21";

async function runSingle(params: {
  prompt: string;
  imageRef: ImgRef;
  aspectRatio?: AspectRatio;
}): Promise<Buffer> {
  ensureConfigured();
  const imageUrl = await uploadRef(params.imageRef);
  const result = (await fal.subscribe(MODEL_SINGLE, {
    input: {
      prompt: params.prompt,
      image_url: imageUrl,
      aspect_ratio: params.aspectRatio ?? "1:1",
      output_format: "png",
      safety_tolerance: "6",
    },
    logs: false,
  })) as { data?: FalKontextResult } & FalKontextResult;

  const images = result.data?.images ?? result.images;
  const url = images?.[0]?.url;
  if (!url) throw new Error(`Fal Kontext: no image in response (${JSON.stringify(result).slice(0, 300)})`);
  return fetchBytes(url);
}

async function runMulti(params: {
  prompt: string;
  imageRefs: ImgRef[];
  aspectRatio?: AspectRatio;
}): Promise<Buffer> {
  ensureConfigured();
  const imageUrls = await Promise.all(params.imageRefs.map(uploadRef));
  const result = (await fal.subscribe(MODEL_MULTI, {
    input: {
      prompt: params.prompt,
      image_urls: imageUrls,
      aspect_ratio: params.aspectRatio ?? "1:1",
      output_format: "png",
      safety_tolerance: "6",
    },
    logs: false,
  })) as { data?: FalKontextResult } & FalKontextResult;

  const images = result.data?.images ?? result.images;
  const url = images?.[0]?.url;
  if (!url) throw new Error(`Fal Kontext Multi: no image in response (${JSON.stringify(result).slice(0, 300)})`);
  return fetchBytes(url);
}

// --- Public API mirrors lib/gemini.ts / lib/vertex-imagen.ts ---

export async function generateCharacterSheet(params: {
  photo: ImgRef;
}): Promise<Buffer> {
  const prompt = `
Produce a CHARACTER REFERENCE SHEET for a children's picture book starring this child.

CRITICAL IDENTITY: Preserve the exact facial likeness of the child in the reference — face shape, eye color, eye spacing, nose, mouth, cheek shape, skin tone, and hair (length, color, texture, hairline) must match exactly. Do NOT generic-ify. Readers must instantly recognize this real child.

Style: modern vibrant watercolor illustration with digital polish — rich saturated colors, confident playful shapes, soft painterly edges, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. No harsh black outlines. Classic picture-book toddler proportions (large head ~3 heads tall, short limbs, rounded belly, sturdy legs).

Outfit: comfortable everyday clothes in warm tones — simple short-sleeve tee, simple play pants, plain sneakers. Nothing costumey.

Composition: SINGLE neutral soft-cream background. Full-body T-pose hero stance, centered, facing camera, calm friendly expression, eyes open, small smile. No props, no companion, no scenery. Full body visible head to toe with a little margin.

No text, no letters, no numbers, no borders, no frames, no watermarks.
`.trim();

  return runSingle({ prompt, imageRef: params.photo, aspectRatio: "3:4" });
}

export async function generatePage(params: {
  heroSheet: ImgRef;
  heroPhoto?: ImgRef;
  companionSheet: ImgRef;
  settingSheets: ImgRef[];
  brief: string;
  textPosition: "top" | "bottom";
}): Promise<Buffer> {
  // NB: heroPhoto is intentionally unused here. Post-approval, the sheet IS
  // the identity contract — passing the photo again just gives FLUX two
  // references to reconcile and causes drift. Sheet + companion + settings.
  void params.heroPhoto;
  const refs: ImgRef[] = [
    params.heroSheet,
    params.companionSheet,
    ...params.settingSheets,
  ];

  const textZone =
    params.textPosition === "bottom"
      ? "Keep all characters, faces, hands, and key action in the UPPER ~75% of the frame. Reserve the BOTTOM ~22% as a calm, gently-washed area. No faces or critical detail in the bottom band."
      : "Keep all characters, faces, hands, and key action in the LOWER ~75% of the frame. Reserve the TOP ~22% as a calm, gently-washed area. No faces or critical detail in the top band.";

  const prompt = `
Render a single children's picture-book page illustration.

SCENE BRIEF:
${params.brief}

HERO IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The first reference image is the hero's APPROVED CHARACTER SHEET — the painted canonical portrait of this exact child that the customer has signed off on. The child on this page MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone.
- SAME hair — exact length, color, texture, hairline.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
Treat the sheet as a portrait contract. Do NOT reinterpret, modernize, simplify, or "improve" the child. Do NOT substitute a generic toddler face. Just paint THIS child, in THIS outfit, doing the scene described.

COMPANION LOCK: Match the companion animal reference exactly — species, colors, proportions, silhouette, distinguishing marks.

SETTING LOCK: Match the environment references — architecture, props, palette, and painted surfaces. Do NOT reinvent recurring landmarks. Camera angle, time of day, and weather may change per the brief, but setting geometry and identifying props are locked.

COMPOSITION:
- ${textZone}
- NO text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. Soft edges, painterly, no harsh black outlines.
`.trim();

  return runMulti({ prompt, imageRefs: refs, aspectRatio: "4:3" });
}

export async function generateCover(params: {
  heroSheet: ImgRef;
  heroPhoto?: ImgRef;
  companionSheet: ImgRef;
  settingSheets: ImgRef[];
  coverBrief: string;
  storyTitle: string;
  heroName: string;
  companionName: string;
}): Promise<Buffer> {
  // Sheet is the identity contract post-approval — photo ref dropped.
  void params.heroPhoto;
  const refs: ImgRef[] = [
    params.heroSheet,
    params.companionSheet,
    ...params.settingSheets,
  ];

  const fallbackBrief = `${params.heroName} and ${params.companionName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${params.heroName}'s face, ${params.companionName} close beside as friend.`;

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${params.storyTitle}".

COVER SCENE:
${params.coverBrief || fallbackBrief}

HERO IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The first reference image is ${params.heroName}'s APPROVED CHARACTER SHEET. The child on the cover MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, skin tone, cheek fullness.
- SAME hair — exact length, color, texture, hairline.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
Do NOT reinterpret, modernize, or "improve" the child. Paint THIS child, in THIS outfit, on the cover.

COMPANION LOCK: Match ${params.companionName}'s reference — species, colors, proportions, silhouette exactly.

SETTING LOCK: Environment and recurring props must match the setting reference(s).

COMPOSITION:
- Hero and companion both clearly visible, warmly lit, inviting pose.
- Reserve the TOP ~38% as a calm, gently-washed area for title typography.
- NO text, letters, numbers, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy.
`.trim();

  return runMulti({ prompt, imageRefs: refs, aspectRatio: "1:1" });
}
