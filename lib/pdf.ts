/**
 * PDF assembly for finished journeysprout books.
 *
 * The Inngest render pipeline produces a cover plus 10 page images (PNG, 1024×1024)
 * and stores each at a Vercel Blob URL. This module downloads those images and
 * stitches them into a single US-Letter portrait PDF using `pdf-lib`, then returns
 * the raw bytes as a Node `Buffer` for upload to Blob storage or attachment to
 * a transactional email (Resend).
 *
 * Each image is centered on its page with a 0.5" margin and scaled down
 * uniformly to fit. Metadata (title, author, creator, producer) is stamped on
 * the resulting document. Fetches run with a concurrency cap of 4 to keep
 * memory use bounded on small serverless runtimes.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";

export type PageSource = {
  /** public URL to the image (PNG or JPEG) */
  url: string;
  /** 1-indexed label used for debugging, e.g. "cover", "p01", "p02" */
  label: string;
};

// US Letter portrait, in points (1pt = 1/72").
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36; // 0.5"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN * 2;

const FETCH_CONCURRENCY = 4;

type FetchedImage = {
  source: PageSource;
  bytes: Uint8Array;
};

function detectFormat(bytes: Uint8Array): "png" | "jpeg" {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  throw new Error("Unrecognized image format (expected PNG or JPEG)");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function fetchImage(source: PageSource): Promise<FetchedImage> {
  let res: Response;
  try {
    res = await fetch(source.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch image ${source.label} from ${source.url}: ${message}`);
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch image ${source.label} from ${source.url}: ${res.status} ${res.statusText}`
    );
  }
  const buf = await res.arrayBuffer();
  return { source, bytes: new Uint8Array(buf) };
}

async function fetchAllWithConcurrency(
  sources: PageSource[],
  concurrency: number
): Promise<FetchedImage[]> {
  const results = new Array<FetchedImage>(sources.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= sources.length) return;
      results[i] = await fetchImage(sources[i]);
    }
  }
  const n = Math.min(concurrency, sources.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Build a single PDF containing the cover followed by all page images in
 * order. Each image is placed on a letter-size portrait page (8.5" × 11")
 * centered and scaled with a small margin so the full image is visible
 * on each page. Source images are fetched via global fetch().
 *
 * Returns the raw PDF as a Buffer, suitable for passing to the Blob
 * uploader or to Resend as an email attachment.
 */
export async function buildBookPdf(params: {
  cover: PageSource;
  pages: PageSource[];
  title: string;
  author: string;
}): Promise<Buffer> {
  const { cover, pages, title, author } = params;
  const ordered: PageSource[] = [cover, ...pages];

  const fetched = await fetchAllWithConcurrency(ordered, FETCH_CONCURRENCY);

  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator("journeysprout");
  doc.setProducer("journeysprout");
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  // Embed the standard font so the PDF viewer doesn't warn on documents with
  // no font resources. We don't draw text, but embedding keeps the file happy.
  await doc.embedFont(StandardFonts.Helvetica);

  for (const { source, bytes } of fetched) {
    const format = detectFormat(bytes);
    const image =
      format === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

    const scale = Math.min(CONTENT_WIDTH / image.width, CONTENT_HEIGHT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = (PAGE_WIDTH - drawWidth) / 2;
    const y = (PAGE_HEIGHT - drawHeight) / 2;

    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });

    console.log(`[pdf] embedded ${source.label} from ${hostOf(source.url)}`);
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
