import { createHash } from "node:crypto";
import postgres from "postgres";
import { Resend } from "resend";

/**
 * Shared helpers for the /api/waitlist route handler.
 *
 * Responsibilities:
 *   - Lazily initialize a Postgres client (only if DATABASE_URL is set).
 *   - Ensure the waitlist table exists (idempotent).
 *   - Insert a signup with ON CONFLICT DO NOTHING.
 *   - Send a notification email via Resend when configured.
 *
 * Everything degrades gracefully so the endpoint still returns ok: true
 * in local dev when RESEND_API_KEY / DATABASE_URL are missing.
 */

type Sql = ReturnType<typeof postgres>;

// Module-level singletons. These persist across warm invocations of a
// single Vercel function instance and reset on cold starts.
let sqlClient: Sql | null = null;
let schemaReady: Promise<void> | null = null;
let warnedMissingDb = false;
let warnedMissingResend = false;

function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (!warnedMissingDb) {
      console.warn(
        "[waitlist] DATABASE_URL is not set — skipping DB persistence (dev mode)."
      );
      warnedMissingDb = true;
    }
    return null;
  }
  if (!sqlClient) {
    sqlClient = postgres(url, {
      // Keep the pool small — this is a single endpoint on a serverless fn.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      // Most managed Postgres providers require TLS. `require` respects the
      // URL's sslmode when present, otherwise enforces TLS.
      ssl: "require",
    });
  }
  return sqlClient;
}

async function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        email TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip TEXT,
        user_agent TEXT
      )
    `.then(() => undefined).catch((err) => {
      // Reset so a future request can retry the DDL.
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export type SignupRecord = {
  email: string;
  ip: string;
  userAgent: string;
};

/**
 * Insert the signup if DATABASE_URL is configured. Silently no-ops otherwise.
 * Duplicate emails are absorbed by ON CONFLICT DO NOTHING.
 */
export async function persistSignup(record: SignupRecord): Promise<void> {
  const sql = getSql();
  if (!sql) return;

  await ensureSchema(sql);
  await sql`
    INSERT INTO waitlist (email, ip, user_agent)
    VALUES (${record.email}, ${record.ip}, ${record.userAgent})
    ON CONFLICT (email) DO NOTHING
  `;
}

/**
 * Fire the notification email to Andrew via Resend. If RESEND_API_KEY is
 * absent we log once and return — the endpoint stays dev-friendly.
 */
export async function sendNotification(record: SignupRecord): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedMissingResend) {
      console.warn(
        "[waitlist] RESEND_API_KEY is not set — skipping email notification (dev mode)."
      );
      warnedMissingResend = true;
    }
    return;
  }

  const from =
    process.env.RESEND_FROM ?? "Journey Sprout <hello@journeysprout.com>";
  const to = process.env.NOTIFY_EMAIL ?? "andrewldalton@gmail.com";
  const timestamp = new Date().toISOString();

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: `New Journey Sprout signup: ${record.email}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f1b16;">
        <h2 style="margin: 0 0 12px; font-size: 20px; color: #c9672a;">A new sprout just landed</h2>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #3f3830;">
          Someone just joined the Journey Sprout waitlist. Here are the details:
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 6px 0 0 6px; font-weight: 600; width: 120px;">Email</td>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 0 6px 6px 0;">${escapeHtml(record.email)}</td>
          </tr>
          <tr><td colspan="2" style="height: 6px;"></td></tr>
          <tr>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 6px 0 0 6px; font-weight: 600;">When</td>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 0 6px 6px 0;">${timestamp}</td>
          </tr>
          <tr><td colspan="2" style="height: 6px;"></td></tr>
          <tr>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 6px 0 0 6px; font-weight: 600;">IP</td>
            <td style="padding: 8px 12px; background: #faf5ec; border-radius: 0 6px 6px 0; font-family: 'SF Mono', Menlo, monospace;">${escapeHtml(record.ip)}</td>
          </tr>
        </table>
        <p style="margin: 24px 0 0; font-size: 12px; color: #8a7f72;">
          Sent automatically from journeysprout.com — IP included for abuse visibility.
        </p>
      </div>
    `,
  });
}

/**
 * Short, non-reversible fingerprint of an email for log lines. Keeps logs
 * readable without leaking subscriber addresses.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
