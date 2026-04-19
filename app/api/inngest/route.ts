import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  generateSheet,
  renderBook,
  markOrderFailed,
} from "@/lib/inngest/functions";

/**
 * Inngest webhook endpoint. Vercel's Inngest integration pings this route
 * to register functions and deliver events. Keep the export list aligned
 * with the functions declared in lib/inngest/functions.ts.
 */
export const runtime = "nodejs";
export const maxDuration = 800; // long-running steps for book rendering

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateSheet, renderBook, markOrderFailed],
});
