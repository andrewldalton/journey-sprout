/**
 * Inngest functions that drive the journeysprout book pipeline.
 *
 * Flow (now two-phase with a customer approval checkpoint):
 *
 *   `journeysprout/order.created` (from POST /api/orders)
 *     → generateSheet: renders the character sheet, saves sheet_url,
 *       sets sheet_status='pending_review', emails customer "your sheet is
 *       ready — come take a look." Stops here.
 *
 *   `journeysprout/sheet.regenerate` (from POST /api/orders/[id]/sheet/regenerate)
 *     → generateSheet again. regen_count was bumped before the event fired.
 *
 *   `journeysprout/sheet.approved` (from POST /api/orders/[id]/sheet/approve)
 *     → renderBook: walks the remaining pipeline —
 *       10 pages → cover → PDF → email → mark emailed.
 */
import { inngest } from "./client";
import {
  getOrder,
  incrementPagesDone,
  updateOrder,
  type Order,
} from "../db";
import {
  loadStoryForOrder,
  runCoverStep,
  runPageStep,
  runPdfStep,
  runSheetStep,
  type RenderContext,
} from "../pipeline";
import { sendBookReadyEmail } from "../email-book";

function toRenderContext(order: Order, opts?: { requireBook?: boolean }): RenderContext {
  if (!order.photoUrl) {
    throw new Error(`order ${order.id} has no photoUrl`);
  }
  if (opts?.requireBook) {
    if (!order.storySlug) throw new Error(`order ${order.id} has no storySlug`);
    if (!order.companionSlug) throw new Error(`order ${order.id} has no companionSlug`);
  }
  return {
    orderId: order.id,
    heroName: order.heroName,
    pronouns: order.pronouns,
    // Sheet step doesn't need these; book step requires them (checked above).
    storySlug: order.storySlug ?? "",
    companionSlug: order.companionSlug ?? "",
    photoUrl: order.photoUrl,
  };
}

/**
 * Phase 1: generate the character sheet. Fired on a new order OR on a
 * customer-initiated regeneration. Stops at sheet_status='pending_review'
 * so the customer can approve or try again.
 */
export const generateSheet = inngest.createFunction(
  {
    id: "generate-sheet",
    retries: 1,
    concurrency: { limit: 8 }, // cheaper step, higher parallelism
    triggers: [
      { event: "journeysprout/order.created" },
      { event: "journeysprout/sheet.regenerate" },
    ],
  },
  async ({ event, step }) => {
    const orderId = event.data?.orderId as string | undefined;
    if (!orderId) throw new Error("event.data.orderId missing");

    const ctx = await step.run("load-order", async () => {
      const o = await getOrder(orderId);
      if (!o) throw new Error(`order ${orderId} not found`);
      return toRenderContext(o);
    });

    await step.run("preflight", async () => {
      // Sheet step doesn't need story/companion; just flag the order as in
      // progress. (Book step re-validates story+companion exist when it runs.)
      await updateOrder(orderId, {
        status: "generating_sheet",
        sheetStatus: "regenerating",
      });
    });

    const sheetUrl = await step.run("generate-sheet", async () => {
      const url = await runSheetStep(ctx);
      await updateOrder(orderId, {
        sheetUrl: url,
        status: "awaiting_sheet_review",
        sheetStatus: "pending_review",
      });
      return url;
    });

    // NB: no "sheet ready" email here. The customer is watching the wizard
    // live — the portrait appears on the same screen. An email would just
    // add noise. (Edge case: if they close the tab, they lose the flow.
    // Acceptable for v1.)

    return { orderId, sheetUrl };
  }
);

/**
 * Phase 2: the book itself. Fires on customer approval.
 */
export const renderBook = inngest.createFunction(
  {
    id: "render-book",
    retries: 1,
    concurrency: { limit: 4 },
    triggers: [{ event: "journeysprout/sheet.approved" }],
  },
  async ({ event, step }) => {
    const orderId = event.data?.orderId as string | undefined;
    if (!orderId) throw new Error("event.data.orderId missing");

    const { ctx, customerEmail, sheetUrl } = await step.run(
      "load-order",
      async () => {
        const o = await getOrder(orderId);
        if (!o) throw new Error(`order ${orderId} not found`);
        if (!o.sheetUrl) throw new Error(`order ${orderId} has no sheet_url`);
        if (o.sheetStatus !== "approved") {
          throw new Error(
            `order ${orderId} sheet_status=${o.sheetStatus}, expected 'approved'`
          );
        }
        return {
          ctx: toRenderContext(o, { requireBook: true }),
          customerEmail: o.email,
          sheetUrl: o.sheetUrl,
        };
      }
    );

    await step.run("mark-rendering", async () => {
      await updateOrder(orderId, { status: "rendering_pages" });
      await incrementPagesDone(orderId); // count the already-approved sheet
    });

    const { manuscript } = await loadStoryForOrder(ctx);

    const pageUrls: { num: number; url: string }[] = [];
    for (const page of manuscript.pages) {
      const url = await step.run(
        `page-${String(page.num).padStart(2, "0")}`,
        async () => {
          const u = await runPageStep(ctx, page, sheetUrl);
          await incrementPagesDone(orderId);
          return u;
        }
      );
      pageUrls.push({ num: page.num, url });
    }

    const coverUrl = await step.run("generate-cover", async () => {
      const url = await runCoverStep(ctx, sheetUrl);
      await incrementPagesDone(orderId);
      return url;
    });

    await step.run("mark-finalizing", () =>
      updateOrder(orderId, { status: "finalizing" })
    );

    const { pdfUrl, title } = await step.run("build-pdf", async () => {
      return runPdfStep(ctx, coverUrl, pageUrls);
    });

    await step.run("mark-ready", () =>
      updateOrder(orderId, { status: "ready", pdfUrl })
    );

    await step.run("email-customer", async () => {
      await sendBookReadyEmail({
        to: customerEmail,
        heroName: ctx.heroName,
        title,
        companionSlug: ctx.companionSlug,
        coverUrl,
        pdfUrl,
      });
      await updateOrder(orderId, { status: "emailed" });
    });

    return { orderId, pdfUrl, coverUrl };
  }
);

/**
 * Fallback error handler — record a failed run on the order so /book/[id]
 * can surface it. Catches failures of either phase.
 */
export const markOrderFailed = inngest.createFunction(
  {
    id: "mark-order-failed",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event }) => {
    const data = event.data as {
      function_id?: string;
      event?: { data?: { orderId?: string } };
      error?: { message?: string };
    };
    const fid = data.function_id ?? "";
    if (!fid.endsWith("render-book") && !fid.endsWith("generate-sheet")) return;
    const orderId = data.event?.data?.orderId;
    if (!orderId) return;
    await updateOrder(orderId, {
      status: "failed",
      error: data.error?.message?.slice(0, 500) ?? "unknown error",
    });
  }
);
