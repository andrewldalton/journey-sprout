/**
 * One-shot admin route to regen the Zoo + Jungle picker covers with a
 * younger (age 2) Beckett, distinct poses, and full-bleed painted backgrounds.
 * Will be deleted after use.
 */
import { GoogleGenAI } from "@google/genai";
import { uploadBytes } from "@/lib/blob";
import {
  generateCharacterSheet,
  generateCover,
} from "@/lib/image-gen";
import { composeCoverTypography } from "@/lib/overlay";
import { COMPANIONS } from "@/lib/catalog";
import { settingSheetPaths, companionSheetPath } from "@/lib/manuscripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const TOKEN = "jsprout-oneshot-regen2";

const BECKETT_PHOTO_PROMPT = `
A single reference photo of a toddler girl named Beckett, about 2 years old, for a children's book pipeline. Realistic photographic style, clean soft daylight, neutral soft-cream background. Standing, facing camera with a calm friendly soft smile, eyes open.

CRITICAL FEATURES:
- Platinum-blonde TIGHT RINGLET curly hair catching light
- Blue-gray eyes
- Fair skin, very round toddler face with pudgy cheeks
- Wearing a black top with small sparkle/star accents, tan pants, blue sneakers

Full body, arms relaxed. No props, no toys, no other people, no text, no borders.
`.trim();

type Job = {
  storyTitle: string;
  companionSlug: string;
  settingsSlug: string;
  samplesKey: string;
  coverBrief: string;
};

const JOBS: Job[] = [
  {
    storyTitle: "Our Big Zoo Day",
    companionSlug: "thistle",
    settingsSlug: "03-seed-took-time",
    samplesKey: "03-seed-took-time-cover.png",
    coverBrief: `A bright zoo plaza in warm morning sun. Beckett (about 2 years old, platinum-blonde tight ringlet curls, BLACK sparkle top, TAN pants, BLUE sneakers) is CROUCHED low with both hands on her knees, leaning forward curiously to peek at a small bright-orange butterfly hovering just above the cobbled path in front of her. Thistle the owl stands close beside her left, looking up at the butterfly too. Behind them the red-and-white striped zoo gate curves overhead, rainbow balloons bobbing on the lamp-post, a giraffe's head peeking over the top rail. Full-bleed painted scene edge-to-edge — NO white or cream neutral background, fill the frame with warm sunlit plaza. Bright, vibrant, joyful.`,
  },
  {
    storyTitle: "The Jungle Whispers Hi",
    companionSlug: "juniper",
    settingsSlug: "04-wish-already-had",
    samplesKey: "04-wish-already-had-cover.png",
    coverBrief: `A sun-dappled jungle path under a mossy stone arch. Beckett (about 2 years old, platinum-blonde tight ringlet curls, BLACK sparkle top, TAN pants, BLUE sneakers) is WALKING FORWARD with her hand HIGH above her head holding on to a low hanging morning-glory vine, mid-stride, peeking into the green jungle with a bright open grin. Juniper the red fox trots playfully just ahead of her on the path, looking back over his shoulder at her. Surround the whole frame edge-to-edge with PAINTED JUNGLE: glossy monstera leaves low-right, tall kapok-tree buttressed roots upper-right, hanging lianas upper-left, pink orchids at the arch base, warm green-gold sun-shafts piercing the canopy. NO white, NO cream, NO neutral background — painted foliage and sunlight in every corner of the frame. Warm vibrant deep jungle tones.`,
  },
];

async function genBeckettPhoto(): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: BECKETT_PHOTO_PROMPT }] }],
  });
  for (const part of res.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return Buffer.from(part.inlineData.data, "base64");
  }
  throw new Error("no photo");
}

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const beckettPhoto = await genBeckettPhoto();
    const sheet = await generateCharacterSheet({
      photo: { type: "buffer", bytes: beckettPhoto, mimeType: "image/jpeg" },
      heroAge: 2,
    });

    const results: Record<string, string> = {};
    for (const job of JOBS) {
      const companion = COMPANIONS.find((c) => c.slug === job.companionSlug);
      if (!companion) throw new Error(`no companion ${job.companionSlug}`);
      const settingFiles = settingSheetPaths(job.settingsSlug);
      const companionFile = companionSheetPath(job.companionSlug);

      const raw = await generateCover({
        heroSheet: { type: "buffer", bytes: sheet, mimeType: "image/png" },
        companionSheet: { type: "file", path: companionFile },
        settingSheets: settingFiles.map((p) => ({ type: "file" as const, path: p })),
        coverBrief: job.coverBrief,
        storyTitle: job.storyTitle,
        heroName: "Beckett",
        companionName: companion.name,
        heroAge: 2,
      });

      const composed = await composeCoverTypography({
        rawImage: raw,
        storyTitle: job.storyTitle,
        heroName: "Beckett",
        companionName: companion.name,
        companionAccent: companion.accent,
      });

      const { url } = await uploadBytes(
        `admin-samples/${Date.now()}-${job.samplesKey}`,
        composed,
        { contentType: "image/png", addRandomSuffix: false }
      );
      results[job.samplesKey] = url;
    }

    return Response.json({ ok: true, results });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
