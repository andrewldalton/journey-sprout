import { createOrder } from "@/lib/db";
import { uploadDataUrl } from "@/lib/blob";
import { inngest } from "@/lib/inngest/client";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// Per-IP in-memory rate limit (resets on cold start; fine for soft launch)
const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

type Body = {
  email?: string;
  heroName?: string;
  pronouns?: string;
  storySlug?: string;
  companionSlug?: string;
  photoDataUrl?: string;
};

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Too many orders from this address. Take a breath." },
      { status: 429 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, heroName, pronouns, storySlug, companionSlug, photoDataUrl } =
    body;

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!heroName || typeof heroName !== "string" || !heroName.trim()) {
    return Response.json({ error: "Hero name is required." }, { status: 400 });
  }
  if (!pronouns || typeof pronouns !== "string") {
    return Response.json({ error: "Pronouns missing." }, { status: 400 });
  }
  if (!storySlug || typeof storySlug !== "string") {
    return Response.json({ error: "Pick a story first." }, { status: 400 });
  }
  if (!companionSlug || typeof companionSlug !== "string") {
    return Response.json({ error: "Pick a companion first." }, { status: 400 });
  }
  if (!photoDataUrl || typeof photoDataUrl !== "string" || !photoDataUrl.startsWith("data:image/")) {
    return Response.json({ error: "Photo is missing or invalid." }, { status: 400 });
  }
  const approxBytes = Math.round((photoDataUrl.length * 3) / 4);
  if (approxBytes > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Photo is too large. Max 10 MB." }, { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanHero = heroName.trim();

  try {
    // 1. Generate the order id up-front so we can key the photo under it
    //    (createOrder generates one internally, but we need the id to build
    //    the Blob key. Upload first with a temp key, then pass the URL in.)
    const photoKey = `orders/pending-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}/photo.jpg`;
    const { url: photoUrl } = await uploadDataUrl(photoKey, photoDataUrl, {
      addRandomSuffix: false,
    });

    // 2. Insert order row (creates id)
    const order = await createOrder({
      email: cleanEmail,
      heroName: cleanHero,
      pronouns,
      storySlug,
      companionSlug,
      photoUrl,
      ip,
      userAgent,
    });

    // 3. Fire Inngest event — this hands off to the rendering pipeline.
    //    Best-effort: if Inngest fails we still return the order (user can
    //    see the status page; we'll surface a retry path later).
    try {
      await inngest.send({
        name: "journeysprout/order.created",
        data: { orderId: order.id },
      });
    } catch (err) {
      console.error("[orders] inngest dispatch failed", err);
    }

    // 4. Notify Andrew a new order landed (fire-and-forget).
    fireNotifyEmail(order.id, cleanEmail, cleanHero, storySlug, companionSlug).catch(
      (e) => console.error("[orders] notify failed", e)
    );

    console.log(`[orders] created ${order.id} for ${storySlug} + ${companionSlug}`);
    return Response.json({ ok: true, orderId: order.id });
  } catch (err) {
    console.error("[orders] failed", err);
    return Response.json(
      { error: "Something went sideways. Try again?" },
      { status: 500 }
    );
  }
}

async function fireNotifyEmail(
  orderId: string,
  email: string,
  heroName: string,
  storySlug: string,
  companionSlug: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "journeysprout <onboarding@resend.dev>";
  const to = process.env.NOTIFY_EMAIL ?? "andrewldalton@gmail.com";
  await resend.emails.send({
    from,
    to,
    subject: `New journeysprout order: ${heroName} + ${companionSlug}`,
    html: `<div style="font-family: system-ui, sans-serif; color: #2d1b0f;">
      <h2 style="font-family: Georgia, serif;">New journeysprout order</h2>
      <p><strong>${orderId}</strong></p>
      <ul>
        <li>Hero: <strong>${escape(heroName)}</strong></li>
        <li>Story: ${escape(storySlug)}</li>
        <li>Companion: ${escape(companionSlug)}</li>
        <li>Customer email: ${escape(email)}</li>
      </ul>
      <p style="color: #6e4a22; font-size: 13px;">Pipeline is running now. You'll get the customer-facing email (copied to you? no) when it finishes.</p>
    </div>`,
  });
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}
