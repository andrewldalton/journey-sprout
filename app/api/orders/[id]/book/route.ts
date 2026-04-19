/**
 * POST /api/orders/[id]/book
 *
 * Customer has approved the sheet and picked a story + companion. This
 * endpoint validates, updates the order with their picks, and fires
 * `journeysprout/sheet.approved` so Inngest renders the book.
 *
 * Body: { storySlug: string, companionSlug: string }
 */
import { getOrder, updateOrder } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { STORIES, COMPANIONS } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  storySlug?: string;
  companionSlug?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || !id.startsWith("ord_")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const storySlug = body.storySlug?.trim();
  const companionSlug = body.companionSlug?.trim();

  if (!storySlug || !STORIES.some((s) => s.slug === storySlug)) {
    return Response.json({ error: "Pick a valid story." }, { status: 400 });
  }
  if (!companionSlug || !COMPANIONS.some((c) => c.slug === companionSlug)) {
    return Response.json({ error: "Pick a valid companion." }, { status: 400 });
  }

  const order = await getOrder(id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  if (order.sheetStatus !== "approved") {
    return Response.json(
      {
        error: "Approve the portrait first — you'll see the button on the review screen.",
      },
      { status: 409 }
    );
  }

  if (!order.sheetUrl) {
    return Response.json({ error: "Sheet not rendered yet." }, { status: 409 });
  }

  // Idempotency: if pages are already rendering/done, don't re-fire the event.
  if (
    order.status === "rendering_pages" ||
    order.status === "finalizing" ||
    order.status === "ready" ||
    order.status === "emailed"
  ) {
    return Response.json({ ok: true, already: true });
  }

  await updateOrder(id, {
    storySlug,
    companionSlug,
  });

  try {
    await inngest.send({
      name: "journeysprout/sheet.approved",
      data: { orderId: id },
    });
  } catch (err) {
    console.error("[orders/book] inngest dispatch failed", err);
    return Response.json(
      { error: "Queued, but the dispatcher hiccuped. You can try again in a moment." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
