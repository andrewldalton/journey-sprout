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
// Hobby plan caps serverless maxDuration at 300s. Inngest splits work
// into steps, so a single invocation only ever covers one step — well
// under the cap. (If we upgrade to Pro, this can go to 800.)
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateSheet, renderBook, markOrderFailed],
});
