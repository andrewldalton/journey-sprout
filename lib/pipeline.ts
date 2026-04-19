/**
 * High-level book generation pipeline — invoked from Inngest steps.
 * Composes Gemini image generation + sharp-based text overlays +
 * Vercel Blob storage into a single ordered build of a book.
 */
import { buildBookPdf, type PageSource } from "./pdf";
import { fetchBytes, uploadBytes } from "./blob";
import {
  generateCharacterSheet,
  generateCover,
  generatePage,
} from "./image-gen";
import { describeHero, qaHeroMatch, parseHeroFeatures } from "./gemini";
import { getOrder, updateOrder } from "./db";
import { composeCoverTypography, composePageBubble } from "./overlay";
import {
  companionSheetPath,
  loadManuscript,
  pronounsFromSlug,
  settingSheetPaths,
  type Manuscript,
  type Page,
  type TokenContext,
} from "./manuscripts";
import { COMPANIONS } from "./catalog";

export type RenderContext = {
  orderId: string;
  heroName: string;
  heroAge: number | null;   // child's age in years if known, null → default
  pronouns: string;    // "she-her" | "he-him" | "they-them"
  storySlug: string;
  companionSlug: string;
  photoUrl: string;    // existing public URL (Vercel Blob)
};

function companionFromSlug(slug: string) {
  const c = COMPANIONS.find((x) => x.slug === slug);
  if (!c) throw new Error(`Unknown companion slug: ${slug}`);
  return c;
}

function tokensFor(ctx: RenderContext, companionName: string): TokenContext {
  const { subject, object } = pronounsFromSlug(ctx.pronouns);
  return {
    heroName: ctx.heroName,
    heroSubject: subject,
    heroObject: object,
    companionName,
  };
}

export async function loadStoryForOrder(ctx: RenderContext): Promise<{
  manuscript: Manuscript;
  companion: ReturnType<typeof companionFromSlug>;
  settingSheetFiles: string[];
  companionSheetFile: string;
}> {
  const companion = companionFromSlug(ctx.companionSlug);
  const manuscript = loadManuscript(ctx.storySlug, tokensFor(ctx, companion.name));
  const settingSheetFiles = settingSheetPaths(ctx.storySlug);
  const companionSheetFile = companionSheetPath(ctx.companionSlug);
  return { manuscript, companion, settingSheetFiles, companionSheetFile };
}

/**
 * Generate the child's character sheet from the submitted photo.
 * Returns the public Blob URL of the sheet.
 */
export async function runSheetStep(ctx: RenderContext): Promise<string> {
  const photoBytes = await fetchBytes(ctx.photoUrl);
  const sheet = await generateCharacterSheet({
    photo: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
    heroAge: ctx.heroAge,
  });
  const { url } = await uploadBytes(
    `orders/${ctx.orderId}/sheet.png`,
    sheet,
    { contentType: "image/png", addRandomSuffix: false }
  );

  // Belt-and-suspenders identity lock: have Gemini Vision describe the
  // sheet's distinctive features in plain text. Stored on the order and
  // included in every downstream page/cover prompt so the model has both
  // an image ref AND a text description to anchor to. Rare features (tight
  // curls, specific outfit colors) survive mean-reversion better this way.
  try {
    const description = await describeHero(sheet);
    await updateOrder(ctx.orderId, { sheetDescription: description });
  } catch (err) {
    console.warn(`[sheet-describe] order ${ctx.orderId} describe failed:`, err);
    // Non-fatal — pages will still render, just without the text anchor.
  }

  return url;
}

/**
 * Fetch the cached hero-features description produced by runSheetStep.
 * Returns null if not yet computed (e.g. order predates the feature, or
 * describe call failed).
 */
async function loadHeroFeatures(orderId: string): Promise<string | null> {
  const o = await getOrder(orderId);
  return o?.sheetDescription ?? null;
}

/**
 * Render one page: Gemini generate + sharp bubble overlay + upload.
 * Returns the public URL of the composed PNG.
 */
export async function runPageStep(
  ctx: RenderContext,
  page: Page,
  sheetUrl: string
): Promise<string> {
  const { companion, settingSheetFiles, companionSheetFile } =
    await loadStoryForOrder(ctx);

  const [sheetBytes, photoBytes] = await Promise.all([
    fetchBytes(sheetUrl),
    fetchBytes(ctx.photoUrl),
  ]);

  const heroFeatures = await loadHeroFeatures(ctx.orderId);
  const parsedFeatures = parseHeroFeatures(heroFeatures);

  // Pre-ship QA loop: render, Vision-check against the sheet, retry up to
  // 2 more times if the hero drifts. Silent fix — customer never sees a
  // bad page if the re-render succeeds.
  const MAX_ATTEMPTS = 3;
  let raw!: Buffer;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    raw = await generatePage({
      heroSheet: { type: "buffer", bytes: sheetBytes, mimeType: "image/png" },
      heroPhoto: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
      companionSheet: { type: "file", path: companionSheetFile },
      settingSheets: settingSheetFiles.map((p) => ({ type: "file" as const, path: p })),
      brief: page.brief,
      textPosition: page.textPosition,
      heroFeatures: heroFeatures ?? undefined,
      heroAge: ctx.heroAge,
    });
    if (attempt === MAX_ATTEMPTS) break;
    try {
      const qa = await qaHeroMatch({
        sheetBytes,
        renderedBytes: raw,
        heroFeatures: parsedFeatures,
      });
      if (qa.pass) break;
      console.warn(
        `[qa] order ${ctx.orderId} page ${page.num} attempt ${attempt} drifted: ${qa.reason} — retrying`
      );
    } catch (e) {
      console.warn(`[qa] order ${ctx.orderId} page ${page.num} qa-call failed, accepting:`, e);
      break;
    }
  }

  const composed = await composePageBubble({
    rawImage: raw,
    text: page.text,
    textPosition: page.textPosition,
    companionAccent: companion.accent,
  });

  const key = `orders/${ctx.orderId}/p${String(page.num).padStart(2, "0")}.png`;
  const { url } = await uploadBytes(key, composed, {
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return url;
}

/**
 * Render the cover: Gemini cover generate + sharp typography overlay + upload.
 */
export async function runCoverStep(
  ctx: RenderContext,
  sheetUrl: string
): Promise<string> {
  const { manuscript, companion, settingSheetFiles, companionSheetFile } =
    await loadStoryForOrder(ctx);

  const [sheetBytes, photoBytes] = await Promise.all([
    fetchBytes(sheetUrl),
    fetchBytes(ctx.photoUrl),
  ]);

  const heroFeatures = await loadHeroFeatures(ctx.orderId);
  const parsedFeatures = parseHeroFeatures(heroFeatures);

  const MAX_ATTEMPTS = 3;
  let raw!: Buffer;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    raw = await generateCover({
      heroSheet: { type: "buffer", bytes: sheetBytes, mimeType: "image/png" },
      heroPhoto: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
      companionSheet: { type: "file", path: companionSheetFile },
      settingSheets: settingSheetFiles.map((p) => ({ type: "file" as const, path: p })),
      coverBrief: manuscript.coverBrief ?? "",
      storyTitle: manuscript.title,
      heroName: ctx.heroName,
      companionName: companion.name,
      heroFeatures: heroFeatures ?? undefined,
      heroAge: ctx.heroAge,
    });
    if (attempt === MAX_ATTEMPTS) break;
    try {
      const qa = await qaHeroMatch({
        sheetBytes,
        renderedBytes: raw,
        heroFeatures: parsedFeatures,
      });
      if (qa.pass) break;
      console.warn(
        `[qa] order ${ctx.orderId} cover attempt ${attempt} drifted: ${qa.reason} — retrying`
      );
    } catch (e) {
      console.warn(`[qa] order ${ctx.orderId} cover qa-call failed, accepting:`, e);
      break;
    }
  }

  const composed = await composeCoverTypography({
    rawImage: raw,
    storyTitle: manuscript.title,
    heroName: ctx.heroName,
    companionName: companion.name,
    companionAccent: companion.accent,
  });

  const { url } = await uploadBytes(`orders/${ctx.orderId}/cover.png`, composed, {
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return url;
}

/**
 * Build the final PDF from the cover + all page URLs, upload to Blob,
 * return the PDF's public URL.
 */
export async function runPdfStep(
  ctx: RenderContext,
  coverUrl: string,
  pageUrls: { num: number; url: string }[]
): Promise<{ pdfUrl: string; title: string }> {
  const { manuscript } = await loadStoryForOrder(ctx);
  const sortedPages: PageSource[] = [...pageUrls]
    .sort((a, b) => a.num - b.num)
    .map((p) => ({ url: p.url, label: `p${String(p.num).padStart(2, "0")}` }));

  const pdfBuffer = await buildBookPdf({
    cover: { url: coverUrl, label: "cover" },
    pages: sortedPages,
    title: manuscript.title,
    author: "journeysprout",
  });

  const { url: pdfUrl } = await uploadBytes(
    `orders/${ctx.orderId}/book.pdf`,
    pdfBuffer,
    { contentType: "application/pdf", addRandomSuffix: false }
  );

  return { pdfUrl, title: manuscript.title };
}
