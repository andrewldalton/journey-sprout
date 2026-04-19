/**
 * TEMPORARY admin route — regenerates marketing-sample imagery
 * (4 story covers + 2 Moonbound sample pages) server-side using the
 * production FLUX pipeline + FAL_KEY. Will be deleted after use.
 *
 * POST /api/admin/regen-covers
 *   Authorization: Bearer <TOKEN>
 *
 * Returns JSON with public Blob URLs for each generated asset.
 * The caller then downloads each URL and commits the PNGs to
 * /public/samples/.
 *
 * NB: depends on the production env (FAL_KEY, GEMINI_API_KEY,
 * BLOB_READ_WRITE_TOKEN) being present on Vercel.
 */
import { GoogleGenAI } from "@google/genai";
import { uploadBytes } from "@/lib/blob";
import {
  generateCharacterSheet,
  generatePage,
  generateCover,
} from "@/lib/image-gen";
import { describeHero } from "@/lib/gemini";
import { composeCoverTypography, composePageBubble } from "@/lib/overlay";
import { STORIES, COMPANIONS } from "@/lib/catalog";
import { loadManuscript, settingSheetPaths, companionSheetPath } from "@/lib/manuscripts";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const TOKEN = "jsprout-oneshot-7f3c9b2e1a4d8f6b";

const BECKETT_PHOTO_PROMPT = `
A single reference photo of a toddler girl named Beckett for a children's book pipeline. Realistic photographic style, clean soft daylight, neutral soft-cream background. Toddler about 3 years old, standing, facing camera with a calm friendly soft smile, eyes open.

CRITICAL FEATURES (must match exactly):
- Platinum-blonde TIGHT RINGLET curly hair catching light
- Blue-gray eyes
- Fair skin
- Wearing a black top with small sparkle/star accents, tan pants, blue sneakers

Composition: full body visible head to toe with a little margin, standing straight, arms relaxed at sides, neutral soft-cream studio background. Good even lighting. No props, no toys, no other people, no text, no watermarks, no borders.
`.trim();

// 4 covers + 2 Moonbound pages, each with a DIFFERENT companion for variety.
const JOBS: Array<
  | {
      kind: "cover";
      slug: string;
      companionSlug: string;
      samplesKey: string; // filename under public/samples/
    }
  | {
      kind: "page";
      pageNum: number;
      storySlug: string;
      companionSlug: string;
      samplesKey: string;
    }
> = [
  { kind: "cover", slug: "01-night-stars", companionSlug: "sprig", samplesKey: "01-night-stars-cover.png" },
  { kind: "cover", slug: "02-long-way-home", companionSlug: "pebble", samplesKey: "02-long-way-home-cover.png" },
  { kind: "cover", slug: "03-seed-took-time", companionSlug: "thistle", samplesKey: "03-seed-took-time-cover.png" },
  { kind: "cover", slug: "04-wish-already-had", companionSlug: "juniper", samplesKey: "04-wish-already-had-cover.png" },
  // Hero + SamplePreview use the Moonbound "finished cover with title" and
  // two sample interior pages as the landing-fan imagery.
  { kind: "page", pageNum: 3, storySlug: "01-night-stars", companionSlug: "sprig", samplesKey: "moonbound-bubble.png" },
  { kind: "page", pageNum: 9, storySlug: "01-night-stars", companionSlug: "sprig", samplesKey: "moonbound-stars.png" },
];

async function genBeckettPhoto(): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: BECKETT_PHOTO_PROMPT }] }],
  });
  const cand = res.candidates?.[0];
  for (const part of cand?.content?.parts ?? []) {
    if (part.inlineData?.data) return Buffer.from(part.inlineData.data, "base64");
  }
  throw new Error("Beckett photo gen: no image in response");
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const steps: Array<{ step: string; ms: number; result?: string }> = [];
  const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const out = await fn();
    steps.push({ step: label, ms: Date.now() - t0 });
    return out;
  };

  try {
    // 1. Beckett reference photo (via Gemini)
    const beckettPhoto = await time("beckett-photo", genBeckettPhoto);

    // 2. Beckett character sheet (via FLUX)
    const sheet = await time("beckett-sheet", () =>
      generateCharacterSheet({
        photo: { type: "buffer", bytes: beckettPhoto, mimeType: "image/jpeg" },
      })
    );

    // 3. Feature description (via Gemini Vision on the painted sheet)
    const heroFeatures = await time("describe-hero", async () => {
      try {
        return await describeHero(sheet);
      } catch (e) {
        console.warn("describeHero failed", e);
        return (
          "The child has platinum-blonde tight ringlet curls, blue-gray eyes, " +
          "fair skin, rounded toddler face, a black top with small sparkle/star " +
          "accents, tan pants, and blue sneakers."
        );
      }
    });

    // 4. Run each cover/page job.
    const results: Record<string, string> = {};
    for (const job of JOBS) {
      const label = `${job.kind}:${job.samplesKey}`;
      await time(label, async () => {
        if (job.kind === "cover") {
          const story = STORIES.find((s) => s.slug === job.slug);
          if (!story) throw new Error(`unknown story ${job.slug}`);
          const companion = COMPANIONS.find((c) => c.slug === job.companionSlug);
          if (!companion) throw new Error(`unknown companion ${job.companionSlug}`);

          const manuscript = loadManuscript(job.slug, {
            heroName: "Beckett",
            heroSubject: "she",
            heroObject: "her",
            companionName: companion.name,
          });
          const settingFiles = settingSheetPaths(job.slug);
          const companionFile = companionSheetPath(job.companionSlug);

          const raw = await generateCover({
            heroSheet: { type: "buffer", bytes: sheet, mimeType: "image/png" },
            companionSheet: { type: "file", path: companionFile },
            settingSheets: settingFiles.map((p) => ({ type: "file" as const, path: p })),
            coverBrief: manuscript.coverBrief ?? "",
            storyTitle: manuscript.title,
            heroName: "Beckett",
            companionName: companion.name,
            heroFeatures,
          });

          const composed = await composeCoverTypography({
            rawImage: raw,
            storyTitle: manuscript.title,
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
        } else {
          const companion = COMPANIONS.find((c) => c.slug === job.companionSlug);
          if (!companion) throw new Error(`unknown companion ${job.companionSlug}`);
          const manuscript = loadManuscript(job.storySlug, {
            heroName: "Beckett",
            heroSubject: "she",
            heroObject: "her",
            companionName: companion.name,
          });
          const page = manuscript.pages.find((p) => p.num === job.pageNum);
          if (!page) throw new Error(`story ${job.storySlug} has no page ${job.pageNum}`);
          const settingFiles = settingSheetPaths(job.storySlug);
          const companionFile = companionSheetPath(job.companionSlug);

          const raw = await generatePage({
            heroSheet: { type: "buffer", bytes: sheet, mimeType: "image/png" },
            companionSheet: { type: "file", path: companionFile },
            settingSheets: settingFiles.map((p) => ({ type: "file" as const, path: p })),
            brief: page.brief,
            textPosition: page.textPosition,
            heroFeatures,
          });

          const composed = await composePageBubble({
            rawImage: raw,
            text: page.text,
            textPosition: page.textPosition,
            companionAccent: companion.accent,
          });

          const { url } = await uploadBytes(
            `admin-samples/${Date.now()}-${job.samplesKey}`,
            composed,
            { contentType: "image/png", addRandomSuffix: false }
          );
          results[job.samplesKey] = url;
        }
      });
    }

    // Also include the moonbound-cover (Moonbound cover with title typography)
    // — reuse the 01-night-stars-cover raw render by re-rendering with the
    // title overlay, since the picker cover and hero cover share the same art.
    // Simpler: just upload a separate key for moonbound-cover that's identical
    // to 01-night-stars-cover for now.

    // 5. Return all URLs.
    void fs; // avoid unused import
    return Response.json({
      ok: true,
      heroFeatures,
      results,
      steps,
      totalMs: steps.reduce((a, s) => a + s.ms, 0),
    });
  } catch (err) {
    console.error("[admin/regen-covers] failed", err);
    return Response.json(
      {
        error: (err as Error).message,
        steps,
      },
      { status: 500 }
    );
  }
}
