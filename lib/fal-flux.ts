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
import { parseHeroFeatures, heroFeaturesToString } from "./gemini";

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

function proportionsForAge(age: number | null | undefined): string {
  const a = age ?? 3;
  if (a <= 2) return "baby/toddler proportions — very large head (~3 heads tall), short chubby limbs, rounded belly, sturdy legs, pudgy cheeks";
  if (a <= 4) return "toddler proportions — large head (~3.25 heads tall), short-to-medium limbs, softly rounded belly, round face";
  if (a <= 6) return "preschooler proportions — head still large (~3.5-4 heads tall), longer limbs, leaner build, round friendly face";
  if (a <= 9) return "young-child proportions — ~4-4.5 heads tall, balanced limbs, leaner body, slimmer face, more defined chin";
  return "older-child proportions — ~4.5-5 heads tall, longer limbs, youthful but leaner face, less baby fat";
}

// --- Public API mirrors lib/gemini.ts / lib/vertex-imagen.ts ---

export async function generateCharacterSheet(params: {
  photo: ImgRef;
  heroAge?: number | null;
}): Promise<Buffer> {
  const age = params.heroAge ?? 3;
  const prompt = `
Produce a CHARACTER REFERENCE SHEET for a children's picture book starring this child.

CRITICAL IDENTITY: Preserve the exact facial likeness of the child in the reference — face shape, eye color + shape + spacing, eyebrow color + shape, nose shape, mouth + lip fullness, cheek fullness, chin shape, skin tone (with any freckles/dimples/birthmarks), and hair (length, color, texture, hairline) must match exactly. Do NOT generic-ify. Readers must instantly recognize this real child.

AGE: The child is about ${age} years old. Render at ${proportionsForAge(age)}. Do NOT paint them older or younger than their actual age.

Style: modern vibrant watercolor illustration with digital polish — rich saturated colors, confident playful shapes, soft painterly edges, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. No harsh black outlines.

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
  heroFeatures?: string;
  heroAge?: number | null;
}): Promise<Buffer> {
  // NB: heroPhoto is intentionally unused here. Post-approval, the sheet IS
  // the identity contract — passing the photo again just gives FLUX two
  // references to reconcile and causes drift. Sheet + companion + settings.
  void params.heroPhoto;
  // Double-weight the sheet by passing it twice. FLUX Kontext Multi averages
  // attention across the reference bundle; duplicating the sheet makes its
  // distinctive features (hair curl pattern, outfit colors, eye color)
  // survive mean-reversion better when the scene/setting is busy.
  const refs: ImgRef[] = [
    params.heroSheet,
    params.heroSheet,
    params.companionSheet,
    ...params.settingSheets,
  ];

  const textZone =
    params.textPosition === "bottom"
      ? "Keep all characters, faces, hands, and key action in the UPPER ~75% of the frame. Reserve the BOTTOM ~22% as a calm, gently-washed area. No faces or critical detail in the bottom band."
      : "Keep all characters, faces, hands, and key action in the LOWER ~75% of the frame. Reserve the TOP ~22% as a calm, gently-washed area. No faces or critical detail in the top band.";

  // Parse the structured JSON features (new path) or fall back to the
  // legacy free-form paragraph (older orders stored the raw ~100-word blob).
  const parsed = parseHeroFeatures(params.heroFeatures);
  const featuresBlock = parsed
    ? `
THE CHILD'S EXACT FEATURES (painted version MUST match these — these are the most load-bearing identity anchors, weight them heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR: ${parsed.hair}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (MUST be identical every page — same top, same pants, same shoes): ${parsed.outfit}
`.trim()
    : params.heroFeatures
      ? `THE CHILD'S EXACT FEATURES (match precisely): ${params.heroFeatures}`
      : "";
  const featuresLine = featuresBlock ? `\n${featuresBlock}\n` : "";
  void heroFeaturesToString; // keep import live across both paths

  // Highest-priority identity pull — face, eyes, size/age, outfit — stated
  // BEFORE the scene brief so the model locks identity first and then fits
  // the scene around it. Repeated in the full features block below.
  const topFeatureLines = parsed
    ? `TOP-PRIORITY IDENTITY ANCHORS (MOST LOAD-BEARING — DO NOT DEVIATE):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- SIZE/BUILD: ${parsed.build}
- OUTFIT (same every page): ${parsed.outfit}

`
    : "";

  const prompt = `
Render a single children's picture-book page illustration.

${topFeatureLines}SCENE BRIEF:
${params.brief}

HERO IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The first two reference images are the hero's APPROVED CHARACTER SHEET — the painted canonical portrait of this exact child that the customer has signed off on. (The sheet is included twice to make sure you weight it heavily.) The child on this page MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone.
- SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline. If the sheet shows tight ringlet curls, do NOT render looser waves. If the sheet shows short hair, do NOT grow it out.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
${featuresLine}
Treat the sheet as a portrait contract. Do NOT reinterpret, modernize, simplify, or "improve" the child. Do NOT substitute a generic toddler face. Just paint THIS child, in THIS outfit, doing the scene described.

AGE LOCK: The child is ${params.heroAge ?? 3} years old, rendered at ${proportionsForAge(params.heroAge)}. Paint them at this age on EVERY page. Do NOT age them up (no older-kid proportions) or down (no baby proportions). Height relative to scene props (doorways, fences, tables, the companion animal) must stay consistent with a ${params.heroAge ?? 3}-year-old across every page.

COLOR LOCK (READ THIS — THIS IS WHERE YOU USUALLY FAIL):
The hero's HAIR COLOR, SKIN TONE, and CLOTHING COLORS are fixed by the sheet. They do NOT change with scene lighting. If the sheet shows blonde hair and a yellow top, paint blonde hair and a yellow top EVEN IF the scene is lit in golden hour, blue twilight, green jungle shade, cool moonlight, or warm honey glow. You may render soft cast shadows and gentle rim-light across the hero from the scene's light source, but you must NEVER repaint the hero's actual hair color, skin tone, or clothing colors to harmonize with the scene palette. Yellow stays yellow. Blonde stays blonde. Do not tint, wash, or palette-shift the hero.

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
  heroFeatures?: string;
  heroAge?: number | null;
}): Promise<Buffer> {
  // Sheet is the identity contract post-approval — photo ref dropped.
  // Sheet is passed twice to double-weight (see generatePage for rationale).
  void params.heroPhoto;
  const refs: ImgRef[] = [
    params.heroSheet,
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
The first two reference images are ${params.heroName}'s APPROVED CHARACTER SHEET (included twice to double-weight it). The child on the cover MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, skin tone, cheek fullness.
- SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline. If the sheet shows tight curls, keep tight curls.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
${(() => {
  const parsed = parseHeroFeatures(params.heroFeatures);
  if (parsed) {
    return `\n${params.heroName.toUpperCase()}'S EXACT FEATURES (MUST match — weight these heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR: ${parsed.hair}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (identical to every page — same top, same pants, same shoes): ${parsed.outfit}\n`;
  }
  return params.heroFeatures ? `\n${params.heroName.toUpperCase()}'S EXACT FEATURES: ${params.heroFeatures}\n` : "";
})()}
Do NOT reinterpret, modernize, or "improve" the child. Paint THIS child, in THIS outfit, on the cover.

AGE LOCK: ${params.heroName} is ${params.heroAge ?? 3} years old, rendered at ${proportionsForAge(params.heroAge)}. Render at that age on the cover.
COLOR LOCK: ${params.heroName}'s hair color, skin tone, and clothing colors are fixed by the sheet and do NOT change with scene lighting. You may render soft cast shadows and gentle rim-light, but NEVER repaint the hero's actual colors to match the scene palette. If the sheet shows blonde hair and a yellow top, they stay blonde and yellow under any lighting.

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
