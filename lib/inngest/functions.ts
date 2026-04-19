/**
 * Inngest functions that drive the journeysprout book pipeline.
 *
 * Event flow:
 *   - `journeysprout/order.created` is sent by POST /api/orders after
 *     validating input, uploading the photo to Blob, and inserting the
 *     order row.
 *   - renderBook fires on that event and walks the pipeline:
 *     sheet → 10 pages → cover → PDF → email → mark emailed.
 *     Each step updates the order row so the /book/[id] page can poll
 *     for live progress.
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

function toRenderContext(order: Order): RenderContext {
  if (!order.photoUrl) {
    throw new Error(`order ${order.id} has no photoUrl`);
  }
  return {
    orderId: order.id,
    heroName: order.heroName,
    pronouns: order.pronouns,
    storySlug: order.storySlug,
    companionSlug: order.companionSlug,
    photoUrl: order.photoUrl,
  };
}

export const renderBook = inngest.createFunction(
  {
    id: "render-book",
    retries: 1,
    concurrency: { limit: 4 }, // cap parallel book renders account-wide
    triggers: [{ event: "journeysprout/order.created" }],
  },
  async ({ event, step }) => {
    const orderId = event.data?.orderId as string | undefined;
    if (!orderId) throw new Error("event.data.orderId missing");

    // Load + ensure we can render. Return only the subset needed for the
    // pipeline (strings/primitives) since step.run serializes through JSON
    // and would strip Date types off a full Order row.
    const ctx = await step.run("load-order", async () => {
      const o = await getOrder(orderId);
      if (!o) throw new Error(`order ${orderId} not found`);
      return toRenderContext(o);
    });
    const customerEmail = await step.run("load-email", async () => {
      const o = await getOrder(orderId);
      if (!o) throw new Error(`order ${orderId} not found`);
      return o.email;
    });

    // Pre-flight: confirm story + companion exist (throws early on bad data)
    await step.run("preflight", async () => {
      await loadStoryForOrder(ctx);
      await updateOrder(orderId, { status: "generating_sheet" });
    });

    // 1. Character sheet from the photo
    const sheetUrl = await step.run("generate-sheet", async () => {
      const url = await runSheetStep(ctx);
      await updateOrder(orderId, { sheetUrl: url, status: "rendering_pages" });
      await incrementPagesDone(orderId);
      return url;
    });

    // 2. Render each manuscript page (one durable step per page)
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

    // 3. Cover
    const coverUrl = await step.run("generate-cover", async () => {
      const url = await runCoverStep(ctx, sheetUrl);
      await incrementPagesDone(orderId);
      return url;
    });

    // 4. PDF
    await step.run("mark-finalizing", () =>
      updateOrder(orderId, { status: "finalizing" })
    );

    const { pdfUrl, title } = await step.run("build-pdf", async () => {
      return runPdfStep(ctx, coverUrl, pageUrls);
    });

    await step.run("mark-ready", () =>
      updateOrder(orderId, { status: "ready", pdfUrl })
    );

    // 5. Email the customer
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
 * Fallback error handler — if the function ultimately fails after retries,
 * record the error on the order row so the /book/[id] page can show it.
 */
export const markOrderFailed = inngest.createFunction(
  {
    id: "mark-order-failed",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event }) => {
    // Defensive parse — we only care about our own function's failures.
    const data = event.data as {
      function_id?: string;
      event?: { data?: { orderId?: string } };
      error?: { message?: string };
    };
    if (!data.function_id?.endsWith("render-book")) return;
    const orderId = data.event?.data?.orderId;
    if (!orderId) return;
    await updateOrder(orderId, {
      status: "failed",
      error: data.error?.message?.slice(0, 500) ?? "unknown error",
    });
  }
);
