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

const SHEET_PROMPT = `
You are producing a CHARACTER REFERENCE SHEET for a children's picture book.

CRITICAL: Preserve the exact facial likeness of the child in the reference photo — face shape, eye color, eye spacing, nose, mouth, cheek shape, and hair color/texture must match the real child. Do NOT generic-ify the face. Readers must instantly recognize them.

Render the child in the journeysprout illustration style:
- Medium: modern vibrant watercolor with digital polish (think Oliver Jeffers, Sam Usher, Christian Robinson at their most vivid — NOT muted, NOT vintage, NOT sepia)
- Edges: soft painterly edges, no harsh black outlines, soft paper grain
- Palette: rich saturated colors — bright and joyful, confident playful shapes
- Lighting: warm vibrant daylight, punchy not muted
- Proportions: classic picture-book toddler (large head ~3 heads tall, short limbs, rounded belly, sturdy legs)

Outfit: comfortable everyday clothes in warm earth tones — soft short-sleeve tee, simple play pants, plain sneakers. Nothing costumey.

Composition: a SINGLE neutral soft-cream background. Show the child in a full-body T-pose-ish hero stance, centered, facing camera, calm friendly expression, eyes open, mouth in a small smile. No props, no companion, no scenery. Just the character, clearly lit, full body visible head to toe with a little margin.

This sheet will be the identity anchor for every subsequent illustration. Match the real child's face exactly.
`.trim();

export async function generateCharacterSheet(params: {
  photo: ImgRef;
}): Promise<Buffer> {
  return generateImage([params.photo], SHEET_PROMPT);
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
You are a children's book art director. Look at the attached CHARACTER REFERENCE SHEET of a painted child.

Describe this child's identifying features in 2 short sentences, like a police sketch brief, so another illustrator could recreate them exactly. Cover:
- HAIR: length (buzz / short / shoulder / long), color, texture (straight / wavy / curly / coily / ringlet), visible hairline
- EYES: color, shape
- FACE: shape (round / oval / heart), notable features (dimples, freckles)
- SKIN TONE
- OUTFIT: top (color, style), bottom (color, style), shoes (color, style)

Be concrete and specific. No fluff, no metaphor. Start the response with "The child has" and stay under 60 words total.
`.trim();

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
}): Promise<Buffer> {
  const { heroSheet, companionSheet, settingSheets, brief, textPosition, heroFeatures } = params;
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
${heroFeatures ? `\nTHE CHILD'S EXACT FEATURES: ${heroFeatures}\n` : ""}
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
}): Promise<Buffer> {
  const { heroSheet, companionSheet, settingSheets, coverBrief, storyTitle, heroName, companionName, heroFeatures } = params;
  // Sheet is the identity contract post-approval — photo ref dropped.
  void params.heroPhoto;

  const fallbackBrief = `${heroName} and ${companionName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${heroName}'s face, ${companionName} close beside as friend, pose that makes a child want to open the book.`;

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${storyTitle}".

COVER SCENE:
${coverBrief || fallbackBrief}

IDENTITY LOCK (THE SHEET IS THE CONTRACT):
The FIRST TWO attached images are ${heroName}'s APPROVED CHARACTER SHEET (included twice to double-weight it). The child on the cover MUST BE IDENTICAL to the sheet: SAME face shape, eye shape, eye color, nose, mouth, cheek fullness, skin tone; SAME hair — exact length, color, texture (straight / wavy / curly / ringlet), hairline; SAME outfit; SAME apparent age. Treat the sheet as a portrait contract.
${heroFeatures ? `\n${heroName.toUpperCase()}'S EXACT FEATURES: ${heroFeatures}\n` : ""}
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
