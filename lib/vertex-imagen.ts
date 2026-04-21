/**
 * Vertex AI Imagen 3 Customization wrapper — same interface as lib/gemini.ts
 * so lib/image-gen.ts can swap between the two by env flag.
 *
 * Uses REST (projects.locations.publishers.models.predict) + google-auth-library
 * because @google-cloud/vertexai's high-level SDK doesn't cover Imagen 3
 * Customization's reference-image payload shape.
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS_JSON contains the full service account
 * JSON as a string (set on Vercel). GOOGLE_CLOUD_PROJECT holds the project id.
 */
import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { parseHeroFeatures } from "./gemini";

// GA successor of imagen-3.0-capability-preview-0930; preview SKU was
// deprecated and now 404s. Subject-customization payload shape is stable.
const MODEL = "imagen-3.0-capability-001";
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";

type ImgRef =
  | { type: "file"; path: string }
  | { type: "buffer"; bytes: Buffer; mimeType?: string }
  | { type: "dataUrl"; dataUrl: string };

function project(): string {
  const p = process.env.GOOGLE_CLOUD_PROJECT;
  if (!p) throw new Error("GOOGLE_CLOUD_PROJECT not set");
  return p;
}

function credsJson(): Record<string, unknown> {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not set");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`
    );
  }
}

let cachedAuth: GoogleAuth | null = null;
function auth(): GoogleAuth {
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({
      credentials: credsJson() as never,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return cachedAuth;
}

function mimeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg";
}

function refToBase64(r: ImgRef): { bytesBase64Encoded: string; mimeType: string } {
  if (r.type === "file") {
    return {
      bytesBase64Encoded: fs.readFileSync(r.path).toString("base64"),
      mimeType: mimeFor(r.path),
    };
  }
  if (r.type === "buffer") {
    return {
      bytesBase64Encoded: r.bytes.toString("base64"),
      mimeType: r.mimeType || "image/png",
    };
  }
  const m = r.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!m) throw new Error("vertex-imagen: invalid base64 data URL");
  return { bytesBase64Encoded: m[2], mimeType: m[1] };
}

// Vertex supports PERSON / ANIMAL / PRODUCT / DEFAULT. We only ever pass
// PERSON (hero) and ANIMAL (companion). DEFAULT was rejected by the API
// when we tried it for style refs. Narrowed here so nobody can reach for
// the un-tested variants without thinking about it.
type SubjectType = "SUBJECT_TYPE_PERSON" | "SUBJECT_TYPE_ANIMAL";

type SubjectReferenceImage = {
  referenceType: "REFERENCE_TYPE_SUBJECT";
  referenceId: number;
  referenceImage: { bytesBase64Encoded: string; mimeType: string };
  subjectImageConfig: {
    subjectDescription: string;
    subjectType: SubjectType;
  };
};

type StyleReferenceImage = {
  referenceType: "REFERENCE_TYPE_STYLE";
  referenceId: number;
  referenceImage: { bytesBase64Encoded: string; mimeType: string };
  styleImageConfig: { styleDescription: string };
};

type ReferenceImage = SubjectReferenceImage | StyleReferenceImage;

// Picture-book toddler/child proportions per age. Mirrors the helper in
// lib/fal-flux.ts and lib/gemini.ts so all three providers describe the
// hero's body the same way.
function proportionsForAge(age: number): string {
  if (age <= 2) return "baby/toddler proportions — very large head (~3 heads tall), short chubby limbs, rounded belly, sturdy legs, pudgy cheeks";
  if (age <= 4) return "toddler proportions — large head (~3.25 heads tall), short-to-medium limbs, softly rounded belly, round face";
  if (age <= 6) return "preschooler proportions — head still large (~3.5-4 heads tall), longer limbs, leaner build, round friendly face";
  if (age <= 9) return "young-child proportions — ~4-4.5 heads tall, balanced limbs, leaner body, slimmer face, more defined chin";
  return "older-child proportions — ~4.5-5 heads tall, longer limbs, youthful but leaner face, less baby fat";
}

async function predict(params: {
  prompt: string;
  referenceImages: ReferenceImage[];
  sampleCount?: number;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
}): Promise<Buffer> {
  const endpoint =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project()}` +
    `/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  const client = await auth().getClient();
  const tokenResp = await client.getAccessToken();
  const token = typeof tokenResp === "string" ? tokenResp : tokenResp.token;
  if (!token) throw new Error("vertex-imagen: failed to acquire access token");

  const body = {
    instances: [
      {
        prompt: params.prompt,
        referenceImages: params.referenceImages,
      },
    ],
    parameters: {
      sampleCount: params.sampleCount ?? 1,
      aspectRatio: params.aspectRatio ?? "1:1",
      safetySetting: "block_only_high",
      // Required to render minors — our hero is a child (typically 2-10).
      // Vertex blocks "allow_adult" on any image containing a minor.
      // Note: project may need allowlist approval in GCP for this value;
      // if it 400s with a different message we'll see it in logs.
      personGeneration: "allow_all",
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vertex Imagen ${res.status}: ${text.slice(0, 800)}`);
  }

  const json = (await res.json()) as {
    predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  };
  const first = json.predictions?.[0];
  if (!first?.bytesBase64Encoded) {
    throw new Error(
      `Vertex Imagen: no image in response (${JSON.stringify(json).slice(0, 400)})`
    );
  }
  return Buffer.from(first.bytesBase64Encoded, "base64");
}

// --- Public API mirrors lib/gemini.ts ---

export async function generateCharacterSheet(params: {
  photo: ImgRef;
  heroAge?: number | null;
  heroName?: string;
  canonicalOutfit?: string;
}): Promise<Buffer> {
  const name = params.heroName ?? "the hero";
  const age = params.heroAge ?? 3;
  const photo = refToBase64(params.photo);
  const outfitLine = params.canonicalOutfit
    ? `Outfit: ignore whatever [1] is wearing in the reference photo. Paint ${name} in this exact outfit: ${params.canonicalOutfit}.`
    : `Outfit: comfortable everyday clothes in warm earth tones — soft short-sleeve tee, simple play pants, plain sneakers. Nothing costumey.`;
  const prompt = `
Produce a CHARACTER REFERENCE SHEET for a children's picture book starring [1] (${name}, a ${age}-year-old child).

CRITICAL IDENTITY: Preserve ${name}'s exact facial likeness from [1] — face shape, eye color, eye spacing, nose, mouth, cheek fullness, chin, eyebrow color + shape, skin tone, and hair color + texture + length must match the real child in the reference. Do NOT generic-ify the face. Readers must instantly recognize ${name}.

AGE: ${name} is about ${age} years old. Render ${name} at ${proportionsForAge(age)}. Do NOT paint ${name} older or younger than their actual age.

Style: modern vibrant watercolor illustration with rich saturated colors, confident playful shapes, soft paper grain, and contemporary picture-book energy (think Oliver Jeffers, Sam Usher, Christian Robinson at their most vivid — NOT muted, NOT vintage, NOT sepia). Bright, joyful, warm but punchy. Soft edges, painterly, no harsh black outlines.

${outfitLine}

Composition: SINGLE neutral soft-cream background. Full-body T-pose-ish hero stance, centered, facing camera, calm friendly expression, eyes open, small smile. No props, no companion, no scenery. Full body visible head to toe with a little margin.

This sheet is the identity anchor for every subsequent page and the cover — match the real child's face exactly so every painted illustration of ${name} is recognizable as the same specific child.

No text, no borders, no frames, no watermarks.
`.trim();

  return predict({
    prompt,
    aspectRatio: "3:4",
    referenceImages: [
      {
        referenceType: "REFERENCE_TYPE_SUBJECT",
        referenceId: 1,
        referenceImage: photo,
        subjectImageConfig: {
          subjectDescription: `${name}, the hero child`,
          subjectType: "SUBJECT_TYPE_PERSON",
        },
      },
    ],
  });
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
  const age = params.heroAge ?? 3;
  // NB: heroPhoto is intentionally unused here. Post-approval, the painted
  // character sheet IS the identity contract — it becomes the PERSON subject
  // ref (id=1). Passing the photo in as well gives Imagen two references to
  // reconcile and causes drift.
  void params.heroPhoto;

  const refs: ReferenceImage[] = [];

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 1,
    referenceImage: refToBase64(params.heroSheet),
    subjectImageConfig: {
      subjectDescription: `${name}, the hero child`,
      subjectType: "SUBJECT_TYPE_PERSON",
    },
  });

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 2,
    referenceImage: refToBase64(params.companionSheet),
    subjectImageConfig: {
      subjectDescription: `${compName}, the ${compSpecies}`,
      subjectType: "SUBJECT_TYPE_ANIMAL",
    },
  });

  // Vertex Imagen 3 capability-001 caps at 2 reference images for
  // non-square aspect ratios. We render pages at 1:1 (board-book
  // square), so the cap doesn't apply — settings can come along.
  let nextId = 3;
  for (const s of params.settingSheets) {
    refs.push({
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceId: nextId++,
      referenceImage: refToBase64(s),
      styleImageConfig: {
        styleDescription:
          "the story's anchor setting — match architecture, props, palette, and painted surfaces exactly",
      },
    });
  }

  const textZone =
    params.textPosition === "bottom"
      ? "Keep all characters, faces, hands, and key action in the UPPER ~75% of the frame. Reserve the BOTTOM ~22% as a calm, gently-washed area (porch boards / grass / ground wash). No faces or critical detail in the bottom band."
      : "Keep all characters, faces, hands, and key action in the LOWER ~75% of the frame. Reserve the TOP ~22% as a calm, gently-washed area (sky / open wall / soft distant background). No faces or critical detail in the top band.";

  const parsedRaw = parseHeroFeatures(params.heroFeatures);
  const parsed = parsedRaw && params.canonicalOutfit
    ? { ...parsedRaw, outfit: params.canonicalOutfit }
    : parsedRaw;
  const featuresBlock = parsed
    ? `
${name.toUpperCase()}'S EXACT FEATURES (painted version MUST match these — weight them heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE): ${parsed.hair}
- ACCESSORIES (MUST be worn on EVERY page if listed — glasses, headbands, etc): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (MUST be identical every page — same top, same pants, same shoes): ${parsed.outfit}

HAIRSTYLE LOCK: preserve the sheet's exact hairstyle — buns stay buns, ponytails stay ponytails, down stays down.
ACCESSORIES LOCK: glasses, headbands, clips listed above MUST be worn on this page.
`.trim()
    : "";
  const featuresLine = featuresBlock ? `\n${featuresBlock}\n` : "";

  const outfitOverride = params.canonicalOutfit
    ? `\nOUTFIT OVERRIDE (critical — this is where Vertex most commonly fails): ${name}'s outfit is FIXED by the sheet and this spec: ${params.canonicalOutfit}. Do NOT substitute scene-appropriate clothing. NO astronaut suits for space scenes, NO bathing suits for beach or water scenes, NO jungle explorer vests, NO costumes of any kind. The outfit NEVER changes because of the scene's setting. If the brief describes a space scene, ${name} still wears the canonical outfit — not a spacesuit. If the brief describes a jungle scene, ${name} still wears the canonical outfit — not safari gear.`
    : "";

  const prompt = `
Render a children's picture-book page illustration. The scene has EXACTLY TWO characters: [1] (${name}, a ${age}-year-old human child) and [2] (${compName}, a small ${compSpecies}). They are two completely different beings — one human, one ${compSpecies}. Painting two children would be wrong; [2] must look like a ${compSpecies}.

SCENE BRIEF:
${params.brief}

CHARACTER SHEETS:
[1] is the approved painted character sheet for ${name} (the human child). [2] is the approved painted character sheet for ${compName} (the ${compSpecies}). Match both exactly in face, features, colors, proportions, and silhouette. [2] keeps the same body size relative to [1] on every page — the ${compSpecies} does NOT grow or shrink between pages.

${name.toUpperCase()} IDENTITY LOCK: [1] must be IDENTICAL to the painted hero sheet — same face, same hair (length, color, texture, hairline, exact hairstyle), same outfit (top, bottoms, shoes), same apparent age. If the sheet shows tight ringlet curls, render tight ringlet curls. If short hair, do NOT grow it out. Treat the sheet as a portrait contract. ${name}'s hair color, skin tone, and clothing colors are FIXED by the sheet — they do NOT shift with scene lighting (yellow stays yellow, blonde stays blonde under any lighting).
${featuresLine}
${compName.toUpperCase()} IDENTITY LOCK: [2] must be IDENTICAL to the painted companion sheet — same ${compSpecies} species, same colors, same proportions, same silhouette, same distinguishing marks. [2] is an ANIMAL, not a human. Render [2] exactly as painted in the companion sheet, at the same relative size to [1] every page.

AGE LOCK: ${name} is EXACTLY ${age} years old — same head-to-body ratio, same face roundness, same limb length as the sheet on every page. Height relative to props and to [2] stays consistent with a ${age}-year-old across every page.
${outfitOverride}

CAST LOCK (important — this is where errors happen): The scene contains EXACTLY ONE [1] AND EXACTLY ONE [2]. Never two humans. Never two ${compSpecies}s. If you ever find yourself about to paint a second child with similar hair or outfit, STOP — the second figure is [2] the ${compSpecies}, not another [1]. No background adults, no other kids, no strangers, no extra animals — unless the scene brief above introduces them by name on this specific page.

SETTING LOCK: Match the attached style references — architecture, recurring props, painted surfaces. Camera angle, time of day, and weather may change per the brief, but setting geometry and landmarks are locked.

ILLUSTRATION CRAFT (make this a living scene, not a character pasted on a backdrop):
- LIGHT INTEGRATION: [1] and [2] are lit by the SAME light source as the scene. Golden hour = warm rim-light on one side of their faces, cool shadow on the other. Twilight = cool cast on skin, warm pockets near lamps. Jungle shade = dappled leaf-shadow patterns breaking across faces and clothes. Their cast shadows fall on the ground plane matching the scene's light direction and length.
- PHYSICAL CONTACT WITH THE WORLD: feet planted with visible weight (cobbles compressing under toes, grass parting, sand dimpling); hands PRESSED on props, fingers curved around railings, palms flat on bench slats; hair + fabric respond to scene wind and gravity; [2]'s body touches [1]'s leg/hip with both bodies showing the gentle compression.
- POSE & WEIGHT: hips shifted, knees bent, one shoulder higher than the other, head tipped — a living child mid-motion or mid-rest, never a stiff mannequin. The pose tells the story before the face does. [2] matches with an animal-natural pose (paw lifted mid-step, tail counterbalancing, head tilted).
- EXPRESSION SPECIFICITY: sell the scene's emotional beat with concrete face anatomy — surprise = eyes WIDE + brows LIFTED + mouth SOFT-OPEN; delighted laugh = eyes SQUINTED shut + cheeks RAISED + mouth WIDE open in laugh-shape; wonder = eyes WIDE + mouth SMALL open + breath held; quiet awe = eyes wide + still + small private smile; tickled giggle = cheeks up + eyes crescent + shoulder raised in glee. Add a glint in the eyes where a detail catches their attention. [2] mirrors the feeling in the ${compSpecies}'s natural vocabulary.
- ENVIRONMENTAL INTEGRATION: feet sink slightly into grass or sand, foliage and props cross in front of arm/leg silhouettes, atmospheric haze softens distant edges, dust motes or pollen or glitter in the shafts of light. [1] and [2] are IN the scene, not pasted in front of it.

COMPOSITION:
- ${textZone}
- NO text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful, not muted or vintage. Soft edges, painterly, no harsh black outlines.
`.trim();

  return predict({
    prompt,
    aspectRatio: "1:1",
    referenceImages: refs,
  });
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
  const age = params.heroAge ?? 3;
  // Sheet is the identity contract post-approval — photo ref dropped.
  void params.heroPhoto;

  const refs: ReferenceImage[] = [];

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 1,
    referenceImage: refToBase64(params.heroSheet),
    subjectImageConfig: {
      subjectDescription: `${name}, the hero child`,
      subjectType: "SUBJECT_TYPE_PERSON",
    },
  });

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 2,
    referenceImage: refToBase64(params.companionSheet),
    subjectImageConfig: {
      subjectDescription: `${compName}, the ${compSpecies}`,
      subjectType: "SUBJECT_TYPE_ANIMAL",
    },
  });

  let nextId = 3;
  for (const s of params.settingSheets) {
    refs.push({
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceId: nextId++,
      referenceImage: refToBase64(s),
      styleImageConfig: {
        styleDescription:
          "the story's anchor setting — match architecture, props, palette, and painted surfaces exactly",
      },
    });
  }

  const fallbackBrief = `${name} and ${compName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${name}'s face, ${compName} close beside as friend.`;

  const parsedRaw = parseHeroFeatures(params.heroFeatures);
  const parsed = parsedRaw && params.canonicalOutfit
    ? { ...parsedRaw, outfit: params.canonicalOutfit }
    : parsedRaw;
  const featuresBlock = parsed
    ? `
${name.toUpperCase()}'S EXACT FEATURES (weight heavily):
- FACE: ${parsed.face}
- EYES: ${parsed.eyes}
- HAIR (length + color + texture + EXACT HAIRSTYLE): ${parsed.hair}
- ACCESSORIES (worn on cover if listed — glasses stay on): ${parsed.accessories}
- NOSE: ${parsed.nose}
- MOUTH: ${parsed.mouth}
- SKIN: ${parsed.skin}
- BUILD/SIZE: ${parsed.build}
- OUTFIT (identical to every page): ${parsed.outfit}
`.trim()
    : "";
  const featuresLine = featuresBlock ? `\n${featuresBlock}\n` : "";

  const outfitOverride = params.canonicalOutfit
    ? `\nOUTFIT OVERRIDE (critical — this is where Vertex most commonly fails): ${name}'s outfit is FIXED by this spec: ${params.canonicalOutfit}. Do NOT substitute scene-appropriate clothing. NO astronaut suits, NO bathing suits, NO jungle explorer vests, NO costumes. The cover outfit is identical to every interior page — NEVER replaced by scene-themed attire.`
    : "";

  const prompt = `
Render a children's picture-book COVER illustration for the book titled "${params.storyTitle}". The cover has EXACTLY TWO characters: [1] (${name}, a ${age}-year-old human child) and [2] (${compName}, a small ${compSpecies}). They are two completely different beings — one human, one ${compSpecies}. Painting two children would be wrong; [2] must look like a ${compSpecies}.

COVER SCENE:
${params.coverBrief || fallbackBrief}

CHARACTER SHEETS:
[1] is the approved painted character sheet for ${name} (the human child). [2] is the approved painted character sheet for ${compName} (the ${compSpecies}). Match both exactly in face, features, colors, proportions, and silhouette. [2] keeps the same body size relative to [1] as on every interior page — the ${compSpecies} does NOT grow or shrink for the cover.

${name.toUpperCase()} IDENTITY LOCK: [1] must be IDENTICAL to the painted hero sheet — same face, same hair (length, color, texture, hairline, exact hairstyle), same outfit (top, bottoms, shoes), same apparent age. Treat the sheet as a portrait contract. ${name}'s hair color, skin tone, and clothing colors are FIXED by the sheet — they do NOT shift with cover lighting.
${featuresLine}
${compName.toUpperCase()} IDENTITY LOCK: [2] must be IDENTICAL to the painted companion sheet — same ${compSpecies} species, same colors, same proportions, same silhouette, same distinguishing marks. [2] is an ANIMAL, not a human. Render [2] exactly as painted in the companion sheet, at the same relative size to [1] as on every interior page.

AGE LOCK: ${name} is EXACTLY ${age} years old — same head-to-body ratio, same face roundness, same limb length as the sheet. The cover must show the same apparent age as every interior page.
${outfitOverride}

CAST LOCK (important — this is where cover errors happen): The cover contains EXACTLY ONE [1] AND EXACTLY ONE [2]. Never two humans. Never two ${compSpecies}s. If you ever find yourself about to paint a second child with similar hair or outfit, STOP — the second figure is [2] the ${compSpecies}, not another [1]. No other people, no other animals, no additional creatures.

SETTING LOCK: Environment and recurring props must match the setting reference(s).

ILLUSTRATION CRAFT (make the cover a living scene, not a character pasted on a backdrop):
- LIGHT INTEGRATION: [1] and [2] are lit by the cover scene's light source. Warm rim-light and cool shadow fall across their faces matching the sun/moon direction. Cast shadows connect to the ground plane.
- PHYSICAL CONTACT: feet planted with visible weight, hands engaged with props or each other, hair and fabric moving with scene air. [2] leans against [1] with gentle body compression shown in both figures.
- POSE & WEIGHT: hips shifted, one shoulder higher, head tipped, inviting body language — a living welcoming stance, never a stiff mannequin. [2] poses animal-naturally beside them.
- EXPRESSION: an inviting open emotion that makes a child want to open the book — warm wide smile with eyes crinkling, cheeks raised, a glint of adventure in the eyes. [2] matches with a species-natural open expression.
- ENVIRONMENTAL INTEGRATION: foliage or scene elements cross in front of parts of the silhouettes, atmospheric haze softens the distance, light motes or petals drift in the air. The pair and the world share a single painted atmosphere.

COMPOSITION:
- [1] and [2] both clearly visible, warmly lit, inviting pose.
- Reserve the TOP ~38% as a calm, gently-washed area for title typography.
- NO text, letters, numbers, labels, captions, signatures, or watermarks.
- No borders, frames, or panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful. Soft edges, painterly, no harsh black outlines.
`.trim();

  return predict({
    prompt,
    aspectRatio: "1:1",
    referenceImages: refs,
  });
}
