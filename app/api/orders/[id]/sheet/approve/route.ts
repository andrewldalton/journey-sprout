/**
 * POST /api/orders/[id]/sheet/approve
 *
 * Customer clicked "Yes, looks like them!" on the sheet-review step. Flips
 * sheet_status to 'approved'. Does NOT yet fire the render event — the
 * customer still needs to pick a story + companion, which happens in the
 * next wizard step. `/api/orders/[id]/book` fires the render event.
 */
import { getOrder, updateOrder } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || !id.startsWith("ord_")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const order = await getOrder(id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  if (order.sheetStatus === "approved") {
    return Response.json({ ok: true, already: true });
  }

  if (order.sheetStatus !== "pending_review") {
    return Response.json(
      { error: `Sheet is ${order.sheetStatus}; approve only works from pending_review.` },
      { status: 409 }
    );
  }

  if (!order.sheetUrl) {
    return Response.json(
      { error: "Sheet not rendered yet; try again in a moment." },
      { status: 409 }
    );
  }

  await updateOrder(id, {
    sheetStatus: "approved",
    sheetApprovedAt: new Date(),
  });

  return Response.json({ ok: true });
}
