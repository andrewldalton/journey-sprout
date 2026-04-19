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
  });
  const { url } = await uploadBytes(
    `orders/${ctx.orderId}/sheet.png`,
    sheet,
    { contentType: "image/png", addRandomSuffix: false }
  );
  return url;
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

  const raw = await generatePage({
    heroSheet: { type: "buffer", bytes: sheetBytes, mimeType: "image/png" },
    heroPhoto: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
    companionSheet: { type: "file", path: companionSheetFile },
    settingSheets: settingSheetFiles.map((p) => ({ type: "file" as const, path: p })),
    brief: page.brief,
    textPosition: page.textPosition,
  });

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

  const raw = await generateCover({
    heroSheet: { type: "buffer", bytes: sheetBytes, mimeType: "image/png" },
    heroPhoto: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
    companionSheet: { type: "file", path: companionSheetFile },
    settingSheets: settingSheetFiles.map((p) => ({ type: "file" as const, path: p })),
    coverBrief: manuscript.coverBrief ?? "",
    storyTitle: manuscript.title,
    heroName: ctx.heroName,
    companionName: companion.name,
  });

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
