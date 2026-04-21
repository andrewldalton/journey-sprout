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
import sharp from "sharp";
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

/**
 * FLUX's Pixtral output-integrity filter returns a pure-black image with
 * HTTP 200 when a prompt + references trip the CSAM/NCII layer (fires
 * regardless of safety_tolerance). Detect those silently-blocked frames
 * and throw so the caller's retry/fallback path kicks in instead of
 * shipping a black page to the customer.
 */
async function rejectIfSafetyBlocked(buf: Buffer, model: string): Promise<Buffer> {
  try {
    const { channels } = await sharp(buf).stats();
    if (channels.length >= 3) {
      const meanLuma = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;
      if (meanLuma < 8) {
        throw new Error(
          `Fal Kontext ${model}: output is safety-blocked (mean luminance ${meanLuma.toFixed(1)}/255 — Pixtral integrity filter trip). Revise brief or let the router fall back.`
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Fal Kontext")) throw err;
    // sharp probe failed for some other reason — don't block the render on a stats failure.
  }
  return buf;
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
  return rejectIfSafetyBlocked(await fetchBytes(url), MODEL_SINGLE);
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
  return rejectIfSafetyBlocked(await fetchBytes(url), MODEL_MULTI);
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
  companionName?: string;
  companionSpecies?: string;
  canonicalOutfit?: string;
}): Promise<Buffer> {
  const name = params.heroName ?? "the hero";
  const compName = params.companionName ?? "the companion";
  const compSpecies = params.companionSpecies ?? "animal";
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
- DISTINGUISHING (the tiny details that make the child specifically them — paint these on every page): ${parsed.distinguishing}

HAIRSTYLE LOCK: If the HAIR description above says the hair is up (bun / ponytail / braid / pigtails / half-up), the hair MUST stay in that exact style on every page — do NOT let it fall out, do NOT render it loose, do NOT substitute a different updo. If the HAIR is down, keep it down. The hairstyle is a fingerprint of this child; preserve it exactly.

ACCESSORIES LOCK: If ACCESSORIES lists glasses, headbands, hair clips, bows, earrings, or anything else, every one of those accessories MUST be worn on this page in the same style and color. Glasses do NOT come off between pages.

DISTINGUISHING-FEATURES LOCK: freckles, dimples, moles, birthmarks, ear shape, cowlicks, gap teeth, eyelash length, and any small asymmetries listed above are what make this child instantly recognizable. Paint them on every page — do NOT soften or omit them. If DISTINGUISHING says "none visible", do NOT invent features the child does not have.
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
Render a children's picture-book page illustration. The scene has EXACTLY TWO characters: ${name} (a ${params.heroAge ?? 3}-year-old human child) and ${compName} (a small ${compSpecies}). They are two completely different beings — one human, one ${compSpecies}. Painting two children would be wrong; ${compName} must look like a ${compSpecies}.

${topFeatureLines}SCENE BRIEF (READ CAREFULLY — the specifics below are the POINT of this page, not optional flavor):
${params.brief}

SCENE MECHANIC LOCK (critical — this is where pages usually go wrong): the brief above describes story-specific elements that MUST appear in the render — magical mechanisms (shimmering bubble shields enclosing the characters, glowing pearls, protective bubbles around heads), specific animals introduced on THIS page by name, and specific visual beats (a striped fish zipping circles, an octopus blushing colors, a shadow sliding across sand, a pearl floating into a palm). These are NOT flavor — a generic pretty scene without them is WRONG. If the brief says ${name} is INSIDE a shimmering bubble shield, the shimmering bubble shield is painted around ${name}. If the brief says a specific animal is present on this page, that animal is painted — do not substitute a different animal from another page.

CHARACTER SHEETS:
The attached references are the approved painted character sheets — one showing ${name} (the human child) and one showing ${compName} (the ${compSpecies}). Match both exactly in face, features, colors, proportions, and silhouette. ${compName} keeps the same body size relative to ${name} on every page (same as the cover) — the ${compSpecies} does NOT grow or shrink between pages.

${name.toUpperCase()} IDENTITY LOCK: ${name} must be IDENTICAL to the painted hero sheet — same face, same hair (length, color, texture, hairline, exact hairstyle), same outfit (top, bottoms, shoes), same apparent age. If the sheet shows tight ringlet curls, render tight ringlet curls. If the sheet shows short hair, do NOT grow it out. Treat the sheet as a portrait contract. ${name}'s hair color, skin tone, and clothing colors are FIXED by the sheet — they do NOT shift with scene lighting (yellow stays yellow, blonde stays blonde under any lighting).
${featuresLine}
${compName.toUpperCase()} IDENTITY LOCK: ${compName} must be IDENTICAL to the painted companion sheet — same ${compSpecies} species, same colors, same proportions, same silhouette, same distinguishing marks. ${compName} is an ANIMAL, not a human. Render ${compName} exactly as painted in the companion sheet, at the same relative size to ${name} every page.

AGE LOCK: ${name} is EXACTLY ${params.heroAge ?? 3} years old — same head-to-body ratio, same face roundness, same limb length as the sheet on every page. Height relative to props and to ${compName} stays consistent.

CAST LOCK (important — this is where errors happen): The scene contains EXACTLY ONE ${name} AND EXACTLY ONE ${compName}. Never two humans. Never two ${compSpecies}s. If you ever find yourself about to paint a second child with similar hair or outfit, STOP — the second figure is ${compName} the ${compSpecies}, not another ${name}. No background adults, no other kids, no strangers, no extra animals — unless the scene brief above introduces them by name on this specific page.

SETTING LOCK: Match the attached setting references — architecture, recurring props, painted surfaces. Camera angle, time of day, and weather may change per the brief, but setting geometry and landmarks are locked.

ILLUSTRATION CRAFT (make this a living scene, not a character pasted on a backdrop):
- LIGHT INTEGRATION: ${name} and ${compName} are lit by the SAME light source as the scene. Golden hour = warm rim-light on one side of their faces, cool shadow on the other. Twilight = cool cast on skin, warm pockets near lamps. Jungle shade = dappled leaf-shadow patterns breaking across faces and clothes. Their cast shadows fall on the ground plane matching the scene's light direction and length — never floating, never disconnected.
- PHYSICAL CONTACT WITH THE WORLD: feet planted with visible weight (cobbles compressing under toes, grass parting, sand dimpling, floorboards bending); hands PRESSED on props, fingers curved around railings, palms flat on bench slats; hair + fabric respond to scene wind and gravity; ${compName}'s body touches ${name}'s leg/hip with both bodies showing the gentle compression.
- POSE & WEIGHT: hips shifted, knees bent, one shoulder higher than the other, head tipped — a living child mid-motion or mid-rest, never a stiff mannequin standing straight at camera. The pose tells the story before the face does. ${compName} matches with an animal-natural pose (paw lifted mid-step, tail counterbalancing, head tilted).
- EXPRESSION SPECIFICITY: sell the scene's emotional beat with concrete face anatomy — surprise = eyes WIDE + brows LIFTED + mouth SOFT-OPEN; delighted laugh = eyes SQUINTED shut + cheeks RAISED + mouth WIDE open in laugh-shape; wonder = eyes WIDE + mouth SMALL open + breath held; quiet awe = eyes wide + still + small private smile pulling at the corners; tickled giggle = cheeks up + eyes crescent + shoulder raised in glee. Add a glint in the eyes where a detail catches their attention. ${compName} mirrors the feeling in the ${compSpecies}'s natural vocabulary.
- ENVIRONMENTAL INTEGRATION: feet sink slightly into grass or sand, foliage and props cross in front of arm/leg silhouettes (not always behind), atmospheric haze softens distant edges, dust motes or pollen or glitter in the shafts of light. ${name} and ${compName} are IN the scene, with the scene, not in front of it.

COMPOSITION:
- ${textZone}
- NO text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. Soft edges, painterly, no harsh black outlines.
`.trim();

  return runMulti({ prompt, imageRefs: refs, aspectRatio: "1:1" });
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
  companionSpecies?: string;
  heroFeatures?: string;
  heroAge?: number | null;
  canonicalOutfit?: string;
}): Promise<Buffer> {
  const name = params.heroName;
  const compName = params.companionName;
  const compSpecies = params.companionSpecies ?? "animal";
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

  const featuresBlock = (() => {
    const parsedRaw = parseHeroFeatures(params.heroFeatures);
    const parsed = parsedRaw && params.canonicalOutfit
      ? { ...parsedRaw, outfit: params.canonicalOutfit }
      : parsedRaw;
    if (parsed) {
      return `\n${name.toUpperCase()}'S EXACT FEATURES (weight heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE — bun stays bun, ponytail stays ponytail): ${parsed.hair}
- ACCESSORIES (worn on cover if listed, same as every page — glasses stay on): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (identical to every page): ${parsed.outfit}
- DISTINGUISHING (paint these — they make ${name} recognizable): ${parsed.distinguishing}
`;
    }
    return params.heroFeatures ? `\n${name.toUpperCase()}'S EXACT FEATURES: ${params.heroFeatures}\n` : "";
  })();

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${params.storyTitle}". The cover has EXACTLY TWO characters: ${name} (a ${params.heroAge ?? 3}-year-old human child) and ${compName} (a small ${compSpecies}). They are two completely different beings — one human, one ${compSpecies}. Painting two children would be wrong; ${compName} must look like a ${compSpecies}.

COVER SCENE:
${params.coverBrief || fallbackBrief}

CHARACTER SHEETS:
The attached references are the approved painted character sheets — one showing ${name} (the human child) and one showing ${compName} (the ${compSpecies}). Match both exactly in face, features, colors, proportions, and silhouette. ${compName} keeps the same body size relative to ${name} as on every interior page — the ${compSpecies} does NOT grow or shrink for the cover.

${name.toUpperCase()} IDENTITY LOCK: ${name} must be IDENTICAL to the painted hero sheet — same face, same hair (length, color, texture, hairline, exact hairstyle), same outfit (top, bottoms, shoes), same apparent age. Treat the sheet as a portrait contract. ${name}'s hair color, skin tone, and clothing colors are FIXED by the sheet — they do NOT shift with cover lighting.
${featuresBlock}
${compName.toUpperCase()} IDENTITY LOCK: ${compName} must be IDENTICAL to the painted companion sheet — same ${compSpecies} species, same colors, same proportions, same silhouette, same distinguishing marks. ${compName} is an ANIMAL, not a human. Render ${compName} exactly as painted in the companion sheet, at the same relative size to ${name} as on every interior page.

AGE LOCK: ${name} is EXACTLY ${params.heroAge ?? 3} years old — same head-to-body ratio, same face roundness, same limb length as the sheet. The cover must show the same apparent age as every interior page.

CAST LOCK (important — this is where cover errors happen): The cover contains EXACTLY ONE ${name} AND EXACTLY ONE ${compName}. Never two humans. Never two ${compSpecies}s. If you ever find yourself about to paint a second child with similar hair or outfit, STOP — the second figure is ${compName} the ${compSpecies}, not another ${name}. No other people, no other animals, no additional creatures.

SETTING LOCK: Environment and recurring props must match the setting reference(s).

ILLUSTRATION CRAFT (make the cover a living scene, not a character pasted on a backdrop):
- LIGHT INTEGRATION: ${name} and ${compName} are lit by the cover scene's light source. Warm rim-light and cool shadow fall across their faces matching the sun/moon direction. Their cast shadows connect to the ground plane — never floating.
- PHYSICAL CONTACT: feet planted with visible weight, hands engaged with props or each other, hair and fabric moving with scene air. ${compName} leans against ${name} with gentle body compression shown in both figures.
- POSE & WEIGHT: hips shifted, one shoulder higher, head tipped, inviting body language — a living welcoming stance, never a stiff mannequin. ${compName} poses animal-naturally beside them.
- EXPRESSION: an inviting open emotion that makes a child want to open the book — warm wide smile with eyes crinkling, cheeks raised, a glint of adventure in the eyes. ${compName} matches with a species-natural open expression.
- ENVIRONMENTAL INTEGRATION: foliage or scene elements cross in front of parts of the silhouettes, atmospheric haze softens the distance, light motes or petals drift in the air. The pair and the world share a single painted atmosphere.

COMPOSITION:
- ${name} and ${compName} both clearly visible, warmly lit, inviting pose.
- Reserve the TOP ~38% as a calm, gently-washed area for title typography.
- NO text, letters, numbers, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy.
`.trim();

  return runMulti({ prompt, imageRefs: refs, aspectRatio: "1:1" });
}
