/**
 * Order persistence + notification helpers for the book builder.
 *
 * For the soft launch this ONLY stores the order intent + notifies Andrew —
 * it does NOT trigger any image generation. That wires up in Phase 3 of the
 * product roadmap (Inngest queue + Gemini pipeline port).
 */

import postgres from "postgres";
import { Resend } from "resend";
import crypto from "node:crypto";

let sql: ReturnType<typeof postgres> | null = null;
let dbWarned = false;
let resendWarned = false;

function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (!dbWarned) {
      console.warn("[orders] DATABASE_URL not set — order persistence disabled");
      dbWarned = true;
    }
    return null;
  }
  sql = postgres(url, { ssl: "require" });
  return sql;
}

async function ensureSchema() {
  const db = getSql();
  if (!db) return null;
  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      hero_name TEXT NOT NULL,
      pronouns TEXT NOT NULL,
      story_slug TEXT NOT NULL,
      companion_slug TEXT NOT NULL,
      photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  return db;
}

export type OrderInput = {
  email: string;
  heroName: string;
  pronouns: string;
  storySlug: string;
  companionSlug: string;
  photoDataUrl: string;
  ip: string;
  userAgent: string;
};

export async function createOrder(input: OrderInput): Promise<{ orderId: string }> {
  const orderId = `ord_${crypto.randomBytes(8).toString("hex")}`;

  const db = await ensureSchema();
  if (db) {
    // NOTE: photoDataUrl is intentionally NOT persisted yet — it's a large
    // base64 string and we don't have object storage (R2/Blob) wired. We
    // store the metadata and log the photo's byte length for now.
    await db`
      INSERT INTO orders (
        id, email, hero_name, pronouns, story_slug, companion_slug, photo_url,
        status, ip, user_agent
      ) VALUES (
        ${orderId},
        ${input.email},
        ${input.heroName},
        ${input.pronouns},
        ${input.storySlug},
        ${input.companionSlug},
        ${null},
        ${"pending"},
        ${input.ip},
        ${input.userAgent}
      )
    `;
  }

  return { orderId };
}

export async function notifyNewOrder(
  orderId: string,
  input: OrderInput
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!resendWarned) {
      console.warn("[orders] RESEND_API_KEY not set — email notify disabled");
      resendWarned = true;
    }
    return;
  }
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "journeysprout <hello@journeysprout.com>";
  const to = process.env.NOTIFY_EMAIL ?? "andrewldalton@gmail.com";
  const photoBytes = Math.round((input.photoDataUrl.length * 3) / 4);
  const photoKb = Math.round(photoBytes / 1024);

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; padding: 24px; color: #2d1b0f; background: #fdf5e0;">
      <h2 style="font-family: Georgia, serif; color: #2d1b0f; margin: 0 0 8px 0;">A new journeysprout order 🌱</h2>
      <p style="color: #6e4a22; margin: 0 0 24px 0;"><strong>${orderId}</strong></p>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">Hero</td><td style="padding: 6px 0;"><strong>${escapeHtml(input.heroName)}</strong> (${escapeHtml(input.pronouns)})</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">Story</td><td style="padding: 6px 0;">${escapeHtml(input.storySlug)}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">Companion</td><td style="padding: 6px 0;">${escapeHtml(input.companionSlug)}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">Email</td><td style="padding: 6px 0;">${escapeHtml(input.email)}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">Photo</td><td style="padding: 6px 0;">${photoKb} KB</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6e4a22;">IP</td><td style="padding: 6px 0;">${escapeHtml(input.ip)}</td></tr>
      </table>
      <p style="color: #6e4a22; margin: 24px 0 0 0; font-size: 13px;">Generation pipeline is not wired yet — this is an intent-only record for soft launch. You'll need to kick off the render manually.</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to,
    subject: `New journeysprout order: ${input.heroName} + ${input.companionSlug}`,
    html,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] ?? c));
}
