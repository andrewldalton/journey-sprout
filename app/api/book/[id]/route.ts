import { getOrder, MAX_SHEET_REGENS } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/book/[id] — public status endpoint for the customer's /book/[id]
 * page. Returns a limited, email-safe subset of the order row so we don't
 * leak IPs / user-agents / other emails in the client.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || !id.startsWith("ord_")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const order = await getOrder(id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    id: order.id,
    status: order.status,
    heroName: order.heroName,
    storySlug: order.storySlug,
    companionSlug: order.companionSlug,
    pagesDone: order.pagesDone,
    pagesTotal: order.pagesTotal,
    pdfUrl: order.pdfUrl,
    sheetUrl: order.sheetUrl,
    sheetStatus: order.sheetStatus,
    regenCount: order.regenCount,
    maxRegens: MAX_SHEET_REGENS,
    regensLeft: Math.max(0, MAX_SHEET_REGENS - order.regenCount),
    error: order.error,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  });
}
