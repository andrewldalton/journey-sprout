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

const MODEL = "imagen-3.0-capability-preview-0930";
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

type SubjectType =
  | "SUBJECT_TYPE_PERSON"
  | "SUBJECT_TYPE_ANIMAL"
  | "SUBJECT_TYPE_PRODUCT"
  | "SUBJECT_TYPE_DEFAULT";

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
      personGeneration: "allow_adult",
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
}): Promise<Buffer> {
  const photo = refToBase64(params.photo);
  const prompt = `
Produce a CHARACTER REFERENCE SHEET for a children's picture book starring the child [1].

CRITICAL IDENTITY: Preserve the exact facial likeness of [1] — face shape, eye color, eye spacing, nose, mouth, cheek shape, and hair color/texture must match the real child. Do NOT generic-ify the face.

Style: modern vibrant watercolor illustration with rich saturated colors, confident playful shapes, soft paper grain, and contemporary picture-book energy (think Oliver Jeffers, Sam Usher, Christian Robinson at their most vivid — NOT muted, NOT vintage, NOT sepia). Bright, joyful, warm but punchy. Soft edges, painterly, no harsh black outlines. Classic picture-book toddler proportions (large head ~3 heads tall, short limbs, rounded belly, sturdy legs).

Outfit: comfortable everyday clothes in warm earth tones — soft short-sleeve tee, simple play pants, plain sneakers. Nothing costumey.

Composition: SINGLE neutral soft-cream background. Full-body T-pose-ish hero stance, centered, facing camera, calm friendly expression, eyes open, small smile. No props, no companion, no scenery. Full body visible head to toe with a little margin.

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
          subjectDescription: "the hero child",
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
}): Promise<Buffer> {
  const refs: ReferenceImage[] = [];

  // Identity anchor: REAL PHOTO as the PERSON subject. The photo has concrete
  // facial features the model can lock to. The painted sheet comes in below
  // as a STYLE ref so the model paints the kid in-style without reinventing
  // their face or hair.
  const personRef = params.heroPhoto ?? params.heroSheet;
  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 1,
    referenceImage: refToBase64(personRef),
    subjectImageConfig: {
      subjectDescription: "the hero child",
      subjectType: "SUBJECT_TYPE_PERSON",
    },
  });

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 2,
    referenceImage: refToBase64(params.companionSheet),
    subjectImageConfig: {
      subjectDescription: "the companion animal",
      subjectType: "SUBJECT_TYPE_ANIMAL",
    },
  });

  // Painted character sheet as STYLE ref — locks the watercolor rendering
  // style of this specific child without adding a second competing PERSON.
  if (params.heroPhoto) {
    refs.push({
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceId: 3,
      referenceImage: refToBase64(params.heroSheet),
      styleImageConfig: {
        styleDescription:
          "the watercolor illustration style of the hero child — painted skin and hair, soft edges, warm palette",
      },
    });
  }

  let nextId = params.heroPhoto ? 4 : 3;
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

  const prompt = `
Render a single children's picture-book page illustration starring [1] and [2].

SCENE BRIEF:
${params.brief}

HERO IDENTITY LOCK (READ BEFORE PAINTING — THIS IS THE MOST IMPORTANT RULE):
[1] is the real-life reference photo of the hero child. Study this photo like a portrait painter studies a sitter. Before you paint anything, commit to these exact features and DO NOT vary them across pages:

  • HAIR: match the photo's hair EXACTLY — same length (buzzed / short / shoulder / long), same color (fair / blonde / light-brown / medium-brown / dark-brown / black / red — whichever the photo shows), same texture (fine straight / wavy / curly / coily), same hairline. If the photo shows a bald or near-bald baby, paint them bald with only the faintest suggestion of fuzz. If the photo shows short hair, do NOT grow it out into waves or curls. If the photo shows long hair, do NOT trim it short. Hair is the single most drifted feature across pages — freeze it.
  • EYES: same eye shape, same iris color, same eye spacing, same brow shape as the photo.
  • FACE: same face shape (round / oval / heart / square), same cheek fullness, same jawline, same nose shape, same mouth shape, same skin tone.
  • AGE: same apparent age. Do not render an older or younger child.

Render the child in painted watercolor style (see the style reference), but treat the photo as a binding likeness contract — the painted kid must be instantly recognizable as this exact real child to their own parent.

OTHER LOCKS:
- [2] is the companion animal reference. Match species, colors, proportions, silhouette, and distinguishing marks exactly.
- Setting/style references lock environment and painted style. Do NOT reinvent recurring landmarks or props. Camera angle, time of day, and weather may change per the brief, but setting geometry and identifying props are locked.

COMPOSITION:
- ${textZone}
- Do NOT render any text, letters, numbers, speech bubbles, labels, captions, signatures, or watermarks.
- No borders, no frames, no panels.
- Full-bleed modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary picture-book energy. Bright and joyful, not muted or vintage. Soft edges, painterly, no harsh black outlines.
`.trim();

  return predict({
    prompt,
    aspectRatio: "4:3",
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
}): Promise<Buffer> {
  const refs: ReferenceImage[] = [];

  const personRef = params.heroPhoto ?? params.heroSheet;
  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 1,
    referenceImage: refToBase64(personRef),
    subjectImageConfig: {
      subjectDescription: `${params.heroName}, the hero child`,
      subjectType: "SUBJECT_TYPE_PERSON",
    },
  });

  refs.push({
    referenceType: "REFERENCE_TYPE_SUBJECT",
    referenceId: 2,
    referenceImage: refToBase64(params.companionSheet),
    subjectImageConfig: {
      subjectDescription: `${params.companionName}, the animal companion`,
      subjectType: "SUBJECT_TYPE_ANIMAL",
    },
  });

  if (params.heroPhoto) {
    refs.push({
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceId: 3,
      referenceImage: refToBase64(params.heroSheet),
      styleImageConfig: {
        styleDescription:
          "the watercolor illustration style of the hero child — painted skin and hair, soft edges, warm palette",
      },
    });
  }

  let nextId = params.heroPhoto ? 4 : 3;
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

  const fallbackBrief = `${params.heroName} and ${params.companionName} stand together at the heart of the story's anchor setting in a welcoming inviting pose, warm open expression on ${params.heroName}'s face, ${params.companionName} close beside as friend.`;

  const prompt = `
Render a children's picture-book COVER illustration in modern vibrant watercolor style for the book titled "${params.storyTitle}".

COVER SCENE:
${params.coverBrief || fallbackBrief}

HERO IDENTITY LOCK (READ BEFORE PAINTING):
[1] is the real-life reference photo of ${params.heroName}. Study it like a portrait painter studies a sitter. The painted child on the cover MUST be instantly recognizable as this exact real child to their own parent.
  • HAIR: match the photo's hair EXACTLY — same length, color, texture, hairline. If bald or near-bald, paint bald. If short, keep short. If long, keep long. Do NOT invent hair the photo doesn't show, do NOT grow or trim it.
  • EYES: same shape, iris color, spacing, brow shape.
  • FACE: same face shape, cheek fullness, jawline, nose, mouth, skin tone.
  • AGE: same apparent age.

Render in watercolor style per the style refs, but identity is a binding contract to this photo.

OTHER LOCKS:
- Match the companion's colors, proportions, and silhouette exactly.
- The environment and recurring props must match the setting reference(s).

COMPOSITION:
- Hero and companion both clearly visible, warmly lit, inviting pose.
- Reserve the TOP ~38% as a calm, gently-washed area for title typography.
- Do NOT render any text, letters, numbers, labels, captions, signatures, or watermarks.
- No borders, no frames, no panels.
- Modern vibrant watercolor — rich saturated colors, confident playful shapes, contemporary bestseller picture-book energy. Bright and joyful. Soft edges, painterly, no harsh black outlines.
`.trim();

  return predict({
    prompt,
    aspectRatio: "4:3",
    referenceImages: refs,
  });
}
