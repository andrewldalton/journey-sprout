/**
 * One-shot admin route: regen Zoo Day picker cover with visible giraffe
 * body, real butterfly target, and no floating sun-face. Deleted after use.
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

const TOKEN = "jsprout-oneshot-regen3";

const BECKETT_PHOTO_PROMPT = `
A single reference photo of a toddler girl named Beckett, about 2 years old, for a children's book pipeline. Realistic photographic style, clean soft daylight, neutral soft-cream background. Standing, facing camera with a calm friendly soft smile, eyes open.

CRITICAL FEATURES:
- Platinum-blonde TIGHT RINGLET curly hair catching light
- Blue-gray eyes
- Fair skin, very round toddler face with pudgy cheeks
- Wearing a black top with small sparkle/star accents, tan pants, blue sneakers

Full body, arms relaxed. No props, no toys, no other people, no text, no borders.
`.trim();

const COVER_BRIEF = `A bright zoo plaza in warm morning sun. Beckett (about 2 years old, platinum-blonde tight ringlet curls, BLACK sparkle top, TAN pants, BLUE sneakers) is CROUCHED low in a proper squat with both hands resting on her knees, leaning forward curiously to peek at a SMALL BRIGHT-ORANGE MONARCH BUTTERFLY with clearly visible open wings, hovering in mid-air just above the cobbled path about one foot in front of her face — the butterfly MUST be plainly visible and in sharp focus as the subject of her attention. Thistle the owl stands close beside her left, looking up at the butterfly too.

Behind them on the LEFT side of the frame: a red-and-white candy-striped zoo entrance arch with a green-leaved tree canopy above it. A REAL GIRAFFE behind the zoo fence in the MID-BACKGROUND — show the giraffe's tall neck rising up from behind the arch/fence so its HEAD AND FULL LONG NECK are clearly visible curving upward into the frame, connected to shoulders and upper body partially hidden by the arch. The giraffe must look like a real zoo animal, NOT a floating cartoon head, NOT a sign — natural proportions, spotted fur pattern, neck anatomically attached. On the RIGHT side: a yellow-and-white striped lemonade stand with a small "LEMONADE" sign.

Rainbow pennant-flag bunting strung overhead between lamp-posts. Soft blue sky with wispy white clouds — NO sun-face, NO anthropomorphic sun, NO cartoon faces in the sky. Full-bleed painted scene edge-to-edge — NO white or cream neutral background, fill the frame with warm sunlit plaza. Bright, vibrant, joyful children's-book watercolor style.`;

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

    const companionSlug = "thistle";
    const settingsSlug = "03-seed-took-time";
    const storyTitle = "Our Big Zoo Day";

    const companion = COMPANIONS.find((c) => c.slug === companionSlug);
    if (!companion) throw new Error(`no companion ${companionSlug}`);
    const settingFiles = settingSheetPaths(settingsSlug);
    const companionFile = companionSheetPath(companionSlug);

    const raw = await generateCover({
      heroSheet: { type: "buffer", bytes: sheet, mimeType: "image/png" },
      companionSheet: { type: "file", path: companionFile },
      settingSheets: settingFiles.map((p) => ({ type: "file" as const, path: p })),
      coverBrief: COVER_BRIEF,
      storyTitle,
      heroName: "Beckett",
      companionName: companion.name,
      heroAge: 2,
    });

    const composed = await composeCoverTypography({
      rawImage: raw,
      storyTitle,
      heroName: "Beckett",
      companionName: companion.name,
      companionAccent: companion.accent,
    });

    const samplesKey = "03-seed-took-time-cover.png";
    const { url } = await uploadBytes(
      `admin-samples/${Date.now()}-${samplesKey}`,
      composed,
      { contentType: "image/png", addRandomSuffix: false }
    );

    return Response.json({ ok: true, results: { [samplesKey]: url } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
