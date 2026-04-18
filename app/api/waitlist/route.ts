import type { NextRequest } from "next/server";
import { hashEmail, persistSignup, sendNotification } from "@/lib/waitlist";

// Force Node runtime — `postgres` needs Node APIs, not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple per-IP in-memory rate limit. Resets on cold start — acceptable for
// a single-region Vercel function on a low-traffic pre-launch page.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawEmail =
    body && typeof body === "object" && "email" in body
      ? (body as { email: unknown }).email
      : undefined;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  const tag = hashEmail(email);
  try {
    // Run persistence + notification in parallel; both degrade to no-ops
    // when their respective env vars are missing.
    await Promise.all([
      persistSignup({ email, ip, userAgent }),
      sendNotification({ email, ip, userAgent }),
    ]);
    console.log(`[waitlist] ok email=${tag} ip=${ip}`);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[waitlist] error email=${tag} ip=${ip}`, err);
    return Response.json(
      { error: "Something went sideways. Try again?" },
      { status: 500 }
    );
  }
}
