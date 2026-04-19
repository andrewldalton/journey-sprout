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

// FAL's SDK wraps HTTP errors and surfaces only the status text by default.
// For 422s we need the actual validation body ("too many images", safety
// filter trip, prompt too long, etc.) to know what to fix — pull it from
// any of the shapes the SDK has used across versions.
function explainFalError(err: unknown, ctx: { model: string; promptLen: number; refCount: number }): Error {
  const e = err as { status?: number; body?: unknown; response?: { body?: unknown; status?: number }; responseBody?: unknown; message?: string };
  const body = e.body ?? e.response?.body ?? e.responseBody;
  const status = e.status ?? e.response?.status;
  const bodyStr = typeof body === "string" ? body : body ? JSON.stringify(body) : "";
  const baseMsg = e.message ?? "Fal Kontext error";
  const enriched = `${baseMsg} [model=${ctx.model} status=${status ?? "?"} promptLen=${ctx.promptLen} refCount=${ctx.refCount}]${bodyStr ? ` body=${bodyStr.slice(0, 500)}` : ""}`;
  return new Error(enriched);
}

async function runSingle(params: {
  prompt: string;
  imageRef: ImgRef;
  aspectRatio?: AspectRatio;
}): Promise<Buffer> {
  ensureConfigured();
  const imageUrl = await uploadRef(params.imageRef);
  let result: { data?: FalKontextResult } & FalKontextResult;
  try {
    result = (await fal.subscribe(MODEL_SINGLE, {
      input: {
        prompt: params.prompt,
        image_url: imageUrl,
        aspect_ratio: params.aspectRatio ?? "1:1",
        output_format: "png",
        safety_tolerance: "6",
      },
      logs: false,
    })) as { data?: FalKontextResult } & FalKontextResult;
  } catch (err) {
    throw explainFalError(err, { model: MODEL_SINGLE, promptLen: params.prompt.length, refCount: 1 });
  }

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
  let result: { data?: FalKontextResult } & FalKontextResult;
  try {
    result = (await fal.subscribe(MODEL_MULTI, {
      input: {
        prompt: params.prompt,
        image_urls: imageUrls,
        aspect_ratio: params.aspectRatio ?? "1:1",
        output_format: "png",
        safety_tolerance: "6",
      },
      logs: false,
    })) as { data?: FalKontextResult } & FalKontextResult;
  } catch (err) {
    throw explainFalError(err, { model: MODEL_MULTI, promptLen: params.prompt.length, refCount: params.imageRefs.length });
  }

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
  heroName?: string;
  canonicalOutfit?: string;
}): Promise<Buffer> {
  // Lean prompt on purpose: FLUX Kontext's single-ref endpoint matches the
  // photo much better when text is minimal. Every "LOCK" paragraph we added
  // to the old version drowned the image reference. The sheet step is a
  // photo→painted portrait — we want FLUX to focus on the face, not parse
  // instructions.
  const age = params.heroAge ?? 3;
  const name = params.heroName ?? "the child";
  const outfitLine = params.canonicalOutfit
    ? `Paint ${name} in this outfit (IGNORE whatever they are wearing in the photo — use this exact outfit): ${params.canonicalOutfit}.`
    : `Paint ${name} in the same outfit they are wearing in the reference photo (same top, bottom, shoes, colors).`;
  const prompt = `
Produce a CHARACTER REFERENCE SHEET for a children's picture book starring ${name}.

Preserve ${name}'s exact facial likeness from the reference photo — face, eyes, nose, mouth, cheeks, chin, skin tone, and hair (length, color, texture, hairline) must match. Readers must instantly recognize ${name}. About ${age} years old — ${proportionsForAge(age)}.

${outfitLine}

Modern vibrant watercolor with digital polish — rich saturated colors, soft painterly edges, no harsh black outlines.

Single neutral soft-cream background. Full-body T-pose, centered, facing camera, calm friendly expression, small smile. No props, no companion, no scenery. No text, no borders.
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
  heroName?: string;
  canonicalOutfit?: string;
}): Promise<Buffer> {
  const name = params.heroName ?? "the hero";
  // NB: heroPhoto is intentionally unused here. Post-approval, the sheet IS
  // the identity contract — passing the photo again just gives FLUX two
  // references to reconcile and causes drift. Sheet + companion + settings.
  void params.heroPhoto;
  // FLUX Kontext Multi hard-caps at 4 refs ("image_urls must be between 1
  // and 4"). We used to double-weight the sheet by passing it twice, but
  // that pushed us to 5 refs on stories with 2 settings and every call
  // 422'd. Drop the duplicate; identity anchor is the single sheet ref +
  // the heroFeatures text block + the canonical outfit string.
  const refs: ImgRef[] = [
    params.heroSheet,
    params.companionSheet,
    ...params.settingSheets,
  ].slice(0, 4);

  const textZone =
    params.textPosition === "bottom"
      ? "Keep all characters, faces, hands, and key action in the UPPER ~75% of the frame. Reserve the BOTTOM ~22% as a calm, gently-washed area. No faces or critical detail in the bottom band."
      : "Keep all characters, faces, hands, and key action in the LOWER ~75% of the frame. Reserve the TOP ~22% as a calm, gently-washed area. No faces or critical detail in the top band.";

  // Parse the structured JSON features (new path) or fall back to the
  // legacy free-form paragraph (older orders stored the raw ~100-word blob).
  // When a canonicalOutfit is provided, it overrides whatever describeHero
  // pulled out of the sheet — the book's outfit is a deterministic choice,
  // not a photo-derived description.
  const parsedRaw = parseHeroFeatures(params.heroFeatures);
  const parsed = parsedRaw && params.canonicalOutfit
    ? { ...parsedRaw, outfit: params.canonicalOutfit }
    : parsedRaw;
  const featuresBlock = parsed
    ? `
THE CHILD'S EXACT FEATURES (painted version MUST match these — weight them heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE): ${parsed.hair}
- ACCESSORIES (MUST be worn on EVERY page if listed — glasses, headbands, etc): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (MUST be identical every page — same top, same pants, same shoes): ${parsed.outfit}

HAIRSTYLE LOCK: If the HAIR description above says the hair is up (bun / ponytail / braid / pigtails / half-up), the hair MUST stay in that exact style on every page — do NOT let it fall out, do NOT render it loose, do NOT substitute a different updo. If the HAIR is down, keep it down. The hairstyle is a fingerprint of this child; preserve it exactly.

ACCESSORIES LOCK: If ACCESSORIES lists glasses, headbands, hair clips, bows, earrings, or anything else, every one of those accessories MUST be worn on this page in the same style and color. Glasses do NOT come off between pages.
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
- HAIR + EXACT HAIRSTYLE (bun/ponytail/braid/down — same every page): ${parsed.hair}
- ACCESSORIES (glasses/headbands/clips — same every page): ${parsed.accessories}
- SIZE/BUILD (same apparent age every page): ${parsed.build}
- OUTFIT (same every page): ${parsed.outfit}

`
    : "";

  const prompt = `
Render a single children's picture-book page illustration starring ${name}.

${topFeatureLines}SCENE BRIEF:
${params.brief}

${name.toUpperCase()} IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The FIRST reference image is ${name}'s APPROVED CHARACTER SHEET — the painted canonical portrait of ${name} that the customer has signed off on. ${name} on this page MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone.
- SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline. If the sheet shows tight ringlet curls, do NOT render looser waves. If the sheet shows short hair, do NOT grow it out.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
${featuresLine}
Treat the sheet as a portrait contract. Do NOT reinterpret, modernize, simplify, or "improve" ${name}. Do NOT substitute a generic toddler face. Just paint ${name}, in ${name}'s outfit, doing the scene described.

AGE LOCK (RIGID): ${name} is EXACTLY ${params.heroAge ?? 3} years old on EVERY page — same face roundness, same head-to-body ratio, same limb length, same facial features as the sheet. Do NOT age ${name} up (older-kid proportions, leaner face, longer limbs, more defined chin) or down (baby/younger-toddler proportions). If the sheet shows a ${params.heroAge ?? 3}-year-old with ${proportionsForAge(params.heroAge).split("—")[0].trim()}, keep that exact apparent age on every page. ${name}'s height relative to scene props (doorways, fences, tables, plants, the companion animal) must stay consistent with a ${params.heroAge ?? 3}-year-old across every page — never taller, never shorter between pages.

COLOR LOCK (READ THIS — THIS IS WHERE YOU USUALLY FAIL):
${name}'s HAIR COLOR, SKIN TONE, and CLOTHING COLORS are fixed by the sheet. They do NOT change with scene lighting. If the sheet shows blonde hair and a yellow top, paint blonde hair and a yellow top EVEN IF the scene is lit in golden hour, blue twilight, green jungle shade, cool moonlight, or warm honey glow. You may render soft cast shadows and gentle rim-light across ${name} from the scene's light source, but you must NEVER repaint ${name}'s actual hair color, skin tone, or clothing colors to harmonize with the scene palette. Yellow stays yellow. Blonde stays blonde. Do not tint, wash, or palette-shift ${name}.

COMPANION LOCK: Match the companion animal reference exactly — species, colors, proportions, silhouette, distinguishing marks. CRITICAL: the companion's SIZE relative to ${name} stays constant on every page. A small fox stays small; a large dinosaur stays large; the companion does NOT grow or shrink between pages. If the companion sheet shows a knee-height animal, it is knee-height on every page. If it shows a child-sized animal, it stays child-sized.

CAST LOCK: The ONLY characters in this illustration are ${name} and the companion animal. Do NOT paint any other people (no friends, no siblings, no parents, no background adults, no onlookers, no strangers), no other animals, and no additional creatures — unless the scene brief above EXPLICITLY introduces them by name on this specific page. Empty the background of humans; crowd scenes become quiet scenes.

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
  canonicalOutfit?: string;
}): Promise<Buffer> {
  // Sheet is the identity contract post-approval — photo ref dropped.
  // FLUX Kontext Multi caps at 4 refs; sheet duplication used to push us
  // over on 2-setting stories. See generatePage for rationale.
  void params.heroPhoto;
  const refs: ImgRef[] = [
    params.heroSheet,
    params.companionSheet,
    ...params.settingSheets,
  ].slice(0, 4);

  const fallbackBrief = `${params.heroName} and ${params.companionName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${params.heroName}'s face, ${params.companionName} close beside as friend.`;

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${params.storyTitle}".

COVER SCENE:
${params.coverBrief || fallbackBrief}

HERO IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The FIRST reference image is ${params.heroName}'s APPROVED CHARACTER SHEET. The child on the cover MUST BE IDENTICAL to the sheet:
- SAME face shape, eye shape, eye color, nose, mouth, skin tone, cheek fullness.
- SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline. If the sheet shows tight curls, keep tight curls.
- SAME outfit — same top, same bottoms, same shoes.
- SAME apparent age.
${(() => {
  const parsedRaw = parseHeroFeatures(params.heroFeatures);
  const parsed = parsedRaw && params.canonicalOutfit
    ? { ...parsedRaw, outfit: params.canonicalOutfit }
    : parsedRaw;
  if (parsed) {
    return `\n${params.heroName.toUpperCase()}'S EXACT FEATURES (weight heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE — bun stays bun, ponytail stays ponytail): ${parsed.hair}
- ACCESSORIES (worn on cover if listed, same as every page — glasses stay on): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (identical to every page): ${parsed.outfit}

HAIRSTYLE LOCK: If HAIR says the style is up (bun/ponytail/braid/pigtails), it stays UP on the cover — do NOT render it down or loose.
ACCESSORIES LOCK: Glasses, headbands, clips, bows listed above MUST be on the hero on the cover — do NOT remove them.\n`;
  }
  return params.heroFeatures ? `\n${params.heroName.toUpperCase()}'S EXACT FEATURES: ${params.heroFeatures}\n` : "";
})()}
Do NOT reinterpret, modernize, or "improve" the child. Paint THIS child, in THIS outfit, on the cover.

AGE LOCK (RIGID): ${params.heroName} is EXACTLY ${params.heroAge ?? 3} years old. Same head-to-body ratio, same face roundness, same limb length as the sheet. Do NOT age them up or down on the cover — the cover must show the same apparent age as every interior page.
COLOR LOCK: ${params.heroName}'s hair color, skin tone, and clothing colors are fixed by the sheet and do NOT change with scene lighting. You may render soft cast shadows and gentle rim-light, but NEVER repaint the hero's actual colors to match the scene palette. If the sheet shows blonde hair and a yellow top, they stay blonde and yellow under any lighting.

COMPANION LOCK: Match ${params.companionName}'s reference — species, colors, proportions, silhouette exactly. ${params.companionName}'s SIZE relative to ${params.heroName} must match the proportions shown in the companion reference (same relative size as on the interior pages — cover must NOT grow or shrink ${params.companionName}).

CAST LOCK: The ONLY characters on this cover are ${params.heroName} and ${params.companionName}. Do NOT paint any other people or animals in the scene.

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
