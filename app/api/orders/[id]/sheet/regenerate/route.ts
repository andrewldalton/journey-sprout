/**
 * POST /api/orders/[id]/sheet/regenerate
 *
 * Customer clicked "Try again" on the sheet-review screen. Bumps regen_count
 * (capped at MAX_SHEET_REGENS), flips sheet_status to 'regenerating', and
 * fires the `sheet.regenerate` event so Inngest re-runs phase 1.
 *
 * 409s if already at the cap, or if sheet isn't in pending_review.
 */
import { getOrder, updateOrder, MAX_SHEET_REGENS } from "@/lib/db";
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

  if (order.sheetStatus !== "pending_review") {
    return Response.json(
      { error: `Sheet is ${order.sheetStatus}; can only regenerate from pending_review.` },
      { status: 409 }
    );
  }

  if (order.regenCount >= MAX_SHEET_REGENS) {
    return Response.json(
      {
        error: `No regenerations left. You've used all ${MAX_SHEET_REGENS}. Approve the current portrait or contact us for a refund.`,
      },
      { status: 409 }
    );
  }

  const newRegenCount = order.regenCount + 1;
  await updateOrder(id, {
    sheetStatus: "regenerating",
    status: "generating_sheet",
    sheetUrl: null,
    regenCount: newRegenCount,
  });

  try {
    await inngest.send({
      name: "journeysprout/sheet.regenerate",
      data: { orderId: id },
    });
  } catch (err) {
    console.error("[sheet-regen] inngest dispatch failed", err);
    return Response.json(
      { error: "Queued, but the dispatcher hiccuped. You can try again in a moment." },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    regenCount: newRegenCount,
    regensLeft: MAX_SHEET_REGENS - newRegenCount,
  });
}
