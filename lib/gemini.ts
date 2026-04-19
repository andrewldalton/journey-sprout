/**
 * Thin wrapper around the Gemini image generation API, tailored for the
 * journeysprout pipeline. Produces PNG buffers for:
 *   - the hero's character sheet (from a real photo)
 *   - a picture-book page (from hero sheet + companion sheet + setting sheets + brief)
 *   - a book cover (same inputs + cover brief)
 */
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const MODEL = "gemini-2.5-flash-image";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not set");
  return k;
}

let client: GoogleGenAI | null = null;
function ai() {
  if (!client) client = new GoogleGenAI({ apiKey: apiKey() });
  return client;
}

function mimeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg";
}

function partFromFile(p: string) {
  return {
    inlineData: {
      mimeType: mimeFor(p),
      data: fs.readFileSync(p).toString("base64"),
    },
  };
}

function partFromBuffer(bytes: Buffer, mimeType = "image/png") {
  return {
    inlineData: {
      mimeType,
      data: bytes.toString("base64"),
    },
  };
}

function partFromDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!m) throw new Error("partFromDataUrl: not a base64 data URL");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

type ImgRef =
  | { type: "file"; path: string }
  | { type: "buffer"; bytes: Buffer; mimeType?: string }
  | { type: "dataUrl"; dataUrl: string };

async function generateImage(refs: ImgRef[], prompt: string): Promise<Buffer> {
  const parts: unknown[] = refs.map((r) => {
    if (r.type === "file") return partFromFile(r.path);
    if (r.type === "buffer") return partFromBuffer(r.bytes, r.mimeType);
    return partFromDataUrl(r.dataUrl);
  });
  parts.push({ text: prompt });

  const res = await ai().models.generateContent({
    model: MODEL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contents: [{ role: "user", parts: parts as any }],
  });
  const cand = res.candidates?.[0];
  if (!cand) throw new Error("Gemini: no candidate returned");
  for (const part of cand.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }
  throw new Error("Gemini: no image in response");
}

// --- Prompts ---

function proportionsForAge(age: number | null | undefined): string {
  const a = age ?? 3;
  if (a <= 2) return "baby/toddler proportions — very large head (~3 heads tall), short chubby limbs, rounded belly, sturdy legs, pudgy cheeks";
  if (a <= 4) return "toddler proportions — large head (~3.25 heads tall), short-to-medium limbs, softly rounded belly, round face";
  if (a <= 6) return "preschooler proportions — head still large (~3.5-4 heads tall), longer limbs, leaner build, round friendly face";
  if (a <= 9) return "young-child proportions — ~4-4.5 heads tall, balanced limbs, leaner body, slimmer face, more defined chin";
  return "older-child proportions — ~4.5-5 heads tall, longer limbs, youthful but leaner face, less baby fat";
}

function buildSheetPrompt(age: number | null | undefined): string {
  return `
You are producing a CHARACTER REFERENCE SHEET for a children's picture book.

CRITICAL: Preserve the exact facial likeness of the child in the reference photo — face shape, eye color, eye spacing, nose shape, mouth shape, lip fullness, chin shape, cheek fullness, eyebrow color + shape, skin tone, and hair color + texture + length must match the real child. Do NOT generic-ify. Readers must instantly recognize them.

AGE: The child is about ${age ?? 3} years old. Render them at ${proportionsForAge(age)}. Do NOT paint them older or younger than their actual age.

Render the child in the journeysprout illustration style:
- Medium: modern vibrant watercolor with digital polish (think Oliver Jeffers, Sam Usher, Christian Robinson at their most vivid — NOT muted, NOT vintage, NOT sepia)
- Edges: soft painterly edges, no harsh black outlines, soft paper grain
- Palette: rich saturated colors — bright and joyful, confident playful shapes
- Lighting: warm vibrant daylight, punchy not muted

Outfit: paint the child in the SAME outfit they are wearing in the reference photo. Match the top, bottom, and shoes exactly — same colors, same style, same cut. Do NOT substitute generic "warm earth tones" or default children's-book clothing. If the photo shows a red striped t-shirt and denim shorts, paint a red striped t-shirt and denim shorts. This outfit becomes the character's canonical outfit for every page of the book.

Composition: a SINGLE neutral soft-cream background. Show the child in a full-body T-pose-ish hero stance, centered, facing camera, calm friendly expression, eyes open, mouth in a small smile. No props, no companion, no scenery. Just the character, clearly lit, full body visible head to toe with a little margin.

This sheet will be the identity anchor for every subsequent illustration. Match the real child's face exactly — preserve every feature that makes them specifically them.
`.trim();
}

export async function generateCharacterSheet(params: {
  photo: ImgRef;
  heroAge?: number | null;
}): Promise<Buffer> {
  return generateImage([params.photo], buildSheetPrompt(params.heroAge));
}

/**
 * Given the approved character sheet, ask Gemini to write a concrete,
 * sketch-artist-style description of the child's identifying features.
 * Used downstream in page/cover prompts to reinforce identity when the
 * sheet image alone gets diluted by other references.
 *
 * Returns ~2 short sentences of plain text. Token-cheap.
 */
const DESCRIBE_PROMPT = `
You are a forensic sketch artist. Look at the attached CHARACTER REFERENCE SHEET of a painted child. Write a concrete description so a second illustrator could recreate this EXACT child — identity AND outfit — on any page of a book without seeing the sheet again.

Return a SINGLE JSON object, nothing else (no prose, no markdown fences, no commentary). Use this exact shape. Each value must be a concrete dense phrase, never empty.

{
  "hair": "length + color + texture + hairline + HAIRSTYLE (down / up in a top-bun / low-bun / single-braid / french-braid / pigtails / ponytail / half-up / pulled-back — be specific about the style) — e.g. 'medium-brown wavy shoulder-length hair pulled up into a high top-bun with a loose strand framing the face'",
  "accessories": "any glasses (shape + color), headbands, hair clips, bows, earrings, necklaces visible — e.g. 'round tortoiseshell glasses with a mild magnification' or 'none'",
  "eyes": "color + shape + spacing + brow color/shape — e.g. 'large round gray-blue eyes, normal spacing, thin medium-arched light-blonde eyebrows'",
  "face": "face shape + cheek fullness + chin + notable features (dimples / freckles / birthmarks) — e.g. 'round toddler face with full pudgy cheeks, a soft rounded chin, tiny dimples'",
  "nose": "nose shape — e.g. 'small button nose, slightly upturned'",
  "mouth": "lip fullness + mouth width + any gap — e.g. 'medium-full rosy lips in a small closed smile'",
  "skin": "specific skin tone — e.g. 'warm-fair with a peach undertone'",
  "build": "apparent age + height ratio — e.g. 'about 3 years old, roughly 3 heads tall, rounded belly, sturdy legs'",
  "outfit": "top + bottom + shoes + accessories in specific colors/styles — e.g. 'mustard yellow short-sleeve crew tee, olive green slim jogger pants cuffed at the ankle, brown leather lace-up sneakers with white soles, no accessories'"
}

Rules:
- Return ONLY the JSON object. No markdown fences. No preamble.
- Every value must be concrete + dense. No metaphor, no fluff, no "cute" or "adorable" filler.
- Colors must be specific (mustard yellow, not just "yellow"; platinum-blonde, not just "blonde").
- If you cannot see a feature clearly, make your best guess from the sheet — never leave a field blank.
`.trim();

export type HeroFeatures = {
  hair: string;
  accessories: string;
  eyes: string;
  face: string;
  nose: string;
  mouth: string;
  skin: string;
  build: string;
  outfit: string;
};

/**
 * Flatten a HeroFeatures JSON blob back to the ~100-word paragraph form
 * used in older code paths. New prompts should prefer the structured
 * fields directly so they can be promoted to dedicated lines.
 */
export function heroFeaturesToString(f: HeroFeatures | null | undefined): string {
  if (!f) return "";
  return [
    `The child has ${f.hair}.`,
    `${capitalize(f.eyes)}.`,
    `${capitalize(f.face)}.`,
    `${capitalize(f.nose)}.`,
    `${capitalize(f.mouth)}.`,
    `Skin: ${f.skin}.`,
    `Build: ${f.build}.`,
    `Outfit: ${f.outfit}.`,
  ].join(" ");
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function parseHeroFeatures(raw: string | null | undefined): HeroFeatures | null {
  if (!raw) return null;
  // Tolerate markdown fences in case Gemini adds them.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const o = JSON.parse(cleaned);
    if (
      typeof o.hair === "string" &&
      typeof o.outfit === "string" &&
      typeof o.face === "string"
    ) {
      return {
        hair: o.hair ?? "",
        accessories: o.accessories ?? "none",
        eyes: o.eyes ?? "",
        face: o.face ?? "",
        nose: o.nose ?? "",
        mouth: o.mouth ?? "",
        skin: o.skin ?? "",
        build: o.build ?? "",
        outfit: o.outfit ?? "",
      };
    }
  } catch {
    // Not JSON — likely legacy paragraph. Caller falls back to treating
    // the raw string as the full features blob.
  }
  return null;
}

export async function describeHero(sheet: Buffer): Promise<string> {
  const parts: unknown[] = [
    partFromBuffer(sheet, "image/png"),
    { text: DESCRIBE_PROMPT },
  ];
  const res = await ai().models.generateContent({
    model: "gemini-2.5-flash",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contents: [{ role: "user", parts: parts as any }],
  });
  const cand = res.candidates?.[0];
  const textParts = cand?.content?.parts?.map((p) => p.text).filter(Boolean) ?? [];
  const text = textParts.join(" ").trim();
  if (!text) throw new Error("describeHero: no text in response");
  return text;
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
  const { heroSheet, companionSheet, settingSheets, brief, textPosition, heroFeatures, heroAge } = params;
  // NB: heroPhoto is intentionally unused here. Post-approval, the sheet IS
  // the identity contract — passing the photo again just gives Gemini two
  // references to reconcile and causes drift.
  void params.heroPhoto;
  const settingLockBlock = settingSheets.length
    ? `
SETTING LOCK (CRITICAL):
- The environment, architecture, and recurring props MUST match the attached setting reference sheet(s) exactly. Do NOT reinvent the house, porch, bedroom, meadow, clearing, or any recurring object (pot, oak tree, blanket, picnic items, cottage door, etc.).
- Same painted surfaces in the same colors. Same railing shape. Same window placement. Same door color. Same pot/blanket/object positions as the sheet.
- You may change camera angle, time-of-day, and weather per the brief, but the underlying setting geometry and identifying props are LOCKED to the sheet.
`.trim()
    : "";

  const textZone =
    textPosition === "bottom"
      ? `- Keep all characters, key action, and critical props in the UPPER ~75% of the frame. Faces, hands, and any important prop must NOT fall into the bottom portion of the image.
- Reserve the BOTTOM ~22% of the image as a CALM, gently-washed area — porch-boards / grass / ground wash / simple watercolor wash. NO faces, NO hands, NO critical action, NO busy details in this bottom band.`
      : `- Keep all characters, key action, and critical props in the LOWER ~75% of the frame. Faces, hands, and any important prop must NOT fall into the top portion of the image.
- Reserve the TOP ~22% of the image as a CALM, gently-washed area — sky / open wall / soft distant background / simple watercolor wash. NO faces, NO hands, NO critical action, NO busy details in this top band.`;

  const prompt = `
Render a single children's picture-book page illustration following this brief exactly:

${brief}

IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The FIRST TWO attached images are the hero's APPROVED CHARACTER SHEET (included twice to double-weight it) — the painted canonical portrait of this exact child that the customer has signed off on. The child on this page MUST BE IDENTICAL to the sheet: SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone; SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline; SAME outfit (top, bottom, shoes); SAME apparent age. Treat the sheet as a portrait contract. Do NOT reinterpret, modernize, simplify, or "improve" the child. If the sheet shows tight ringlet curls, do NOT render looser waves. If the sheet shows short hair, do NOT grow it out.
${(() => {
  const parsed = parseHeroFeatures(heroFeatures);
  if (parsed) {
    return `\nTHE CHILD'S EXACT FEATURES (weight heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE — bun stays bun, ponytail stays ponytail, down stays down): ${parsed.hair}
- ACCESSORIES (on every page if listed — glasses stay on): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (same every page — same top, same pants, same shoes): ${parsed.outfit}

HAIRSTYLE LOCK: Preserve the exact hairstyle from the sheet. Do NOT let buns fall out or ponytails dissolve.
ACCESSORIES LOCK: Glasses, headbands, clips listed above MUST be worn on this page.\n`;
  }
  return heroFeatures ? `\nTHE CHILD'S EXACT FEATURES: ${heroFeatures}\n` : "";
})()}
AGE LOCK: The child is ${heroAge ?? 3} years old, rendered at ${proportionsForAge(heroAge)}. Paint them at this age on every page. Do NOT age them up (no older-kid proportions) or down (no baby proportions).
COLOR LOCK: The hero's hair color, skin tone, and clothing colors are fixed by the sheet. They do NOT change with scene lighting. You may render soft cast shadows and gentle rim-light from the scene's light source, but you must NEVER repaint the hero's actual hair color, skin tone, or clothing colors to harmonize with golden-hour / twilight / jungle-green / etc. scene palettes. Yellow stays yellow. Blonde stays blonde.
- The NEXT attached image is the COMPANION SHEET. Match the companion's species, colors, proportions, silhouette, and distinguishing marks exactly.
- If the brief below describes hero or companion features differently than the sheets, the sheets WIN. The brief is for scene and action only.

${settingLockBlock}

COMPOSITION CONSTRAINTS (CRITICAL):
${textZone}
- Do NOT render any text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks anywhere on the image.
- No borders, no frames, no panels drawn into the art.
- Full-bleed illustration outside the reserved calm zone, modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. Soft edges, painterly, no harsh black outlines.
`.trim();

  const refs: ImgRef[] = [heroSheet, heroSheet, companionSheet, ...settingSheets];
  return generateImage(refs, prompt);
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
  const { heroSheet, companionSheet, settingSheets, coverBrief, storyTitle, heroName, companionName, heroFeatures, heroAge } = params;
  // Sheet is the identity contract post-approval — photo ref dropped.
  void params.heroPhoto;

  const fallbackBrief = `${heroName} and ${companionName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${heroName}'s face, ${companionName} close beside as friend, pose that makes a child want to open the book.`;

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${storyTitle}".

COVER SCENE:
${coverBrief || fallbackBrief}

IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The FIRST TWO attached images are ${heroName}'s APPROVED CHARACTER SHEET (included twice to double-weight it). The child on the cover MUST BE IDENTICAL to the sheet: SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone; SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline; SAME outfit; SAME apparent age. Treat the sheet as a portrait contract.
${(() => {
  const parsed = parseHeroFeatures(heroFeatures);
  if (parsed) {
    return `\n${heroName.toUpperCase()}'S EXACT FEATURES (weight heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (with EXACT HAIRSTYLE — bun stays bun, ponytail stays ponytail): ${parsed.hair}
- ACCESSORIES (glasses stay on for the cover if listed): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (same as every page): ${parsed.outfit}\n`;
  }
  return heroFeatures ? `\n${heroName.toUpperCase()}'S EXACT FEATURES: ${heroFeatures}\n` : "";
})()}
AGE LOCK: ${heroName} is ${heroAge ?? 3} years old — render at ${proportionsForAge(heroAge)}.
COLOR LOCK: ${heroName}'s hair color, skin tone, and clothing colors do NOT change with cover lighting. Soft shadows and rim-light OK; never repaint ${heroName}'s actual colors to match the scene palette.
- The NEXT attached image is the COMPANION SHEET — match colors, proportions, silhouette exactly.

${
  settingSheets.length
    ? `SETTING LOCK (CRITICAL):
- The environment, architecture, and recurring props MUST match the attached setting reference sheet(s) exactly. Same painted surfaces in the same colors. Same landmarks. Same recurring props in their anchor positions.`
    : ""
}

COMPOSITION CONSTRAINTS (CRITICAL):
- Hero and companion are both clearly visible, warmly lit, inviting pose.
- Reserve the TOP ~38% of the image as a CALM, gently-washed area for the title typography.
- Do NOT render any text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks anywhere on the image.
- No borders, no frames, no panels drawn into the art.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful. Soft edges, painterly, no harsh black outlines.
`.trim();

  const refs: ImgRef[] = [heroSheet, heroSheet, companionSheet, ...settingSheets];
  return generateImage(refs, prompt);
}
