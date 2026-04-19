/**
 * POST /api/orders/[id]/sheet/approve
 *
 * Customer clicked "Make the book" on the sheet-review screen. Flips the
 * order to sheet_status='approved' and fires the `sheet.approved` event so
 * Inngest kicks off phase 2 (pages → cover → PDF → email).
 *
 * Idempotent: if the sheet is already approved, returns 200 without firing
 * a second event. Rejects if the sheet isn't yet in pending_review.
 */
import { getOrder, updateOrder } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

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

  try {
    await inngest.send({
      name: "journeysprout/sheet.approved",
      data: { orderId: id },
    });
  } catch (err) {
    console.error("[sheet-approve] inngest dispatch failed", err);
    return Response.json(
      { error: "Queued, but the dispatcher hiccuped. You can try again in a moment." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
