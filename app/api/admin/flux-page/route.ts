/**
 * One-shot admin: render a SINGLE page of any story via FLUX only (no
 * router, no Vertex/Gemini fallback), using a specific order's approved
 * sheet + photo + description. Lets us A/B a story's pages page-by-page
 * against the same hero portrait without kicking off a full order.
 *
 * POST /api/admin/flux-page
 *   body: { pageNum: 1-10, orderId?: string, storySlug?: string, companionSlug?: string }
 *   defaults: orderId = latest 'Beckett' order with a sheet,
 *             storySlug = "02-long-way-home",
 *             companionSlug = that order's companion.
 *
 * Returns: { ok, url, pageNum, orderId, storySlug, companionSlug, brief }
 *
 * Keep bearer-gated. Remove after testing.
 */
import { generatePage } from "@/lib/fal-flux";
import { parseHeroFeatures } from "@/lib/gemini";
import { pickOutfit } from "@/lib/outfits";
import { sanitizeBrief } from "@/lib/brief-sanitizer";
import { getOrder } from "@/lib/db";
import {
  companionSheetPath,
  loadManuscript,
  pronounsFromSlug,
  settingSheetPaths,
} from "@/lib/manuscripts";
import { COMPANIONS } from "@/lib/catalog";
import { fetchBytes, uploadBytes } from "@/lib/blob";
import postgres from "postgres";

const TOKEN = "jsprout-oneshot-flux-test";
const DEFAULT_STORY = "02-long-way-home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pageNum?: number;
    orderId?: string;
    storySlug?: string;
    companionSlug?: string;
  };
  const pageNum = body.pageNum;
  if (!pageNum || pageNum < 1 || pageNum > 10) {
    return Response.json({ error: "pageNum must be 1-10" }, { status: 400 });
  }
  const storySlug = body.storySlug ?? DEFAULT_STORY;

  // Resolve orderId: use provided one, or latest Beckett order with a sheet.
  let orderId = body.orderId;
  if (!orderId) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return Response.json({ error: "no DATABASE_URL" }, { status: 500 });
    const sql = postgres(dbUrl, { max: 1, idle_timeout: 20, ssl: "require" });
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM orders
      WHERE hero_name = 'Beckett' AND sheet_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `;
    await sql.end();
    orderId = rows[0]?.id;
    if (!orderId) {
      return Response.json({ error: "no Beckett order with a sheet found" }, { status: 404 });
    }
  }

  const order = await getOrder(orderId);
  if (!order) return Response.json({ error: `order ${orderId} not found` }, { status: 404 });
  if (!order.sheetUrl) return Response.json({ error: "order has no sheet_url" }, { status: 400 });
  if (!order.photoUrl) return Response.json({ error: "order has no photo_url" }, { status: 400 });

  const companionSlug = body.companionSlug ?? order.companionSlug ?? "thistle";
  const companion = COMPANIONS.find((c) => c.slug === companionSlug);
  if (!companion) {
    return Response.json({ error: `unknown companion: ${companionSlug}` }, { status: 400 });
  }

  const { subject, object } = pronounsFromSlug(order.pronouns);
  const manuscript = loadManuscript(storySlug, {
    heroName: order.heroName,
    heroSubject: subject,
    heroObject: object,
    companionName: companion.name,
  });
  const page = manuscript.pages.find((p) => p.num === pageNum);
  if (!page) {
    return Response.json({ error: `page ${pageNum} not found in ${storySlug}` }, { status: 404 });
  }

  const outfit = pickOutfit(order.pronouns, order.heroAge);
  const settingFiles = settingSheetPaths(storySlug);
  const companionFile = companionSheetPath(companion.slug);

  const [sheetBytes, photoBytes] = await Promise.all([
    fetchBytes(order.sheetUrl),
    fetchBytes(order.photoUrl),
  ]);

  const heroFeatures = order.sheetDescription ?? undefined;
  void parseHeroFeatures; // keep import live for future structured-feature usage

  const { sanitized: cleanBrief, changes } = sanitizeBrief(page.brief);

  try {
    const buf = await generatePage({
      heroSheet: { type: "buffer", bytes: sheetBytes, mimeType: "image/png" },
      heroPhoto: { type: "buffer", bytes: photoBytes, mimeType: "image/jpeg" },
      companionSheet: { type: "file", path: companionFile },
      settingSheets: settingFiles.map((p) => ({ type: "file" as const, path: p })),
      brief: cleanBrief,
      textPosition: page.textPosition,
      heroFeatures,
      heroAge: order.heroAge,
      heroName: order.heroName,
      companionName: companion.name,
      companionSpecies: companion.species,
      canonicalOutfit: outfit.description,
    });
    const key = `admin-flux-test/${order.id}/${storySlug}-p${String(pageNum).padStart(2, "0")}-${Date.now()}.png`;
    const { url } = await uploadBytes(key, buf, {
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return Response.json({
      ok: true,
      url,
      pageNum,
      orderId: order.id,
      storySlug,
      companionSlug: companion.slug,
      sanitizerChanges: changes,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: (err as Error).message,
        pageNum,
        orderId: order.id,
        storySlug,
      },
      { status: 500 }
    );
  }
}
