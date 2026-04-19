import { createOrder } from "@/lib/db";
import { uploadDataUrl } from "@/lib/blob";
import { inngest } from "@/lib/inngest/client";
import { STORIES, COMPANIONS } from "@/lib/catalog";
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
  // storySlug / companionSlug are OPTIONAL at this stage. The new flow lets
  // the customer upload a photo + name first, preview+approve the painted
  // portrait, then pick story + companion on /api/orders/[id]/book. We still
  // accept them here for backwards-compat with any old clients.
  if (storySlug !== undefined && storySlug !== null && typeof storySlug !== "string") {
    return Response.json({ error: "Invalid story." }, { status: 400 });
  }
  if (companionSlug !== undefined && companionSlug !== null && typeof companionSlug !== "string") {
    return Response.json({ error: "Invalid companion." }, { status: 400 });
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
      storySlug: storySlug ?? null,
      companionSlug: companionSlug ?? null,
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
    fireNotifyEmail(
      order.id,
      cleanEmail,
      cleanHero,
      storySlug ?? null,
      companionSlug ?? null,
    ).catch((e) => console.error("[orders] notify failed", e));

    console.log(`[orders] created ${order.id} (story=${storySlug ?? "tbd"}, companion=${companionSlug ?? "tbd"})`);
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
  storySlug: string | null,
  companionSlug: string | null
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "journeysprout <onboarding@resend.dev>";
  const to = process.env.NOTIFY_EMAIL ?? "andrewldalton@gmail.com";

  const storyTitle = storySlug
    ? (STORIES.find((s) => s.slug === storySlug)?.title ?? storySlug)
    : "(picking after sheet approval)";
  const companionName = companionSlug
    ? (COMPANIONS.find((c) => c.slug === companionSlug)?.name ?? companionSlug)
    : "(picking after sheet approval)";

  const ts = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3e7c4;font-family:Georgia,'Times New Roman',serif;color:#2d1b0f;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3e7c4;">
  <tr><td align="center" style="padding:32px 16px 8px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fdf5e0;border-radius:20px;overflow:hidden;border:1px solid #d9c9a7;">
      <tr><td align="center" style="padding:28px 24px 4px 24px;">
        <div style="font-family:Georgia,serif;font-size:12px;letter-spacing:0.32em;color:#b26a6a;text-transform:uppercase;">New order</div>
      </td></tr>
      <tr><td style="padding:10px 36px 0 36px;">
        <h1 style="margin:0 0 6px 0;font-family:Georgia,serif;font-style:italic;font-weight:700;color:#2d1b0f;font-size:26px;line-height:1.2;">
          A new journeysprout book is in the oven.
        </h1>
        <div style="margin:4px 0 20px 0;">
          <span style="display:inline-block;width:5px;height:5px;border-radius:3px;background:#c9672a;margin-right:6px;vertical-align:middle;"></span>
          <span style="display:inline-block;width:5px;height:5px;border-radius:3px;background:#c9672a;margin-right:6px;vertical-align:middle;"></span>
          <span style="display:inline-block;width:5px;height:5px;border-radius:3px;background:#c9672a;vertical-align:middle;"></span>
        </div>
        <p style="margin:0 0 20px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#4a3220;">
          An order just landed. The pipeline is painting now — you'll get a copy of the customer's delivery email when it's ready (usually in under ten minutes).
        </p>
      </td></tr>
      <tr><td style="padding:0 36px 12px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7edd0;border:1px solid #d9c9a7;border-radius:14px;">
          <tr><td style="padding:16px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#2d1b0f;line-height:1.7;">
            <div style="color:#6e4a22;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;margin-bottom:8px;">The order</div>
            <div><strong>Hero:</strong> ${escape(heroName)}</div>
            <div><strong>Story:</strong> ${escape(storyTitle)}</div>
            <div><strong>Companion:</strong> ${escape(companionName)}</div>
            <div><strong>Customer:</strong> ${escape(email)}</div>
            <div><strong>Submitted:</strong> ${escape(ts)} CT</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 36px 24px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:12px 16px;background:#ebdcb1;border-radius:12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#4a3220;">
            <strong style="color:#2d1b0f;">Order ID</strong>
            <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;margin-top:4px;letter-spacing:0.02em;">${escape(orderId)}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 36px 28px 36px;">
        <a href="https://journey-sprout.vercel.app/book/${escape(orderId)}" style="display:inline-block;background:#c9672a;color:#fdf5e0;font-family:Georgia,serif;font-weight:600;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px;">
          Follow the render →
        </a>
      </td></tr>
      <tr><td style="padding:16px 36px 26px 36px;border-top:1px solid #d9c9a7;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a7a44;line-height:1.55;">
          <strong style="color:#2d1b0f;">journeysprout</strong> · Internal operations notice · Omaha, Nebraska
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  await resend.emails.send({
    from,
    to,
    subject: `New journeysprout order — ${heroName} · ${storyTitle}`,
    html,
  });
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}
