import { createOrder, notifyNewOrder, type OrderInput } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB cap on base64 data URL

// Per-IP in-memory rate limit (resets on cold start — acceptable for soft launch)
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

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Too many orders from this address. Take a breath." },
      { status: 429 }
    );
  }

  let body: Partial<OrderInput>;
  try {
    body = (await request.json()) as Partial<OrderInput>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, heroName, pronouns, storySlug, companionSlug, photoDataUrl } =
    body;

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
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
  if (!photoDataUrl || typeof photoDataUrl !== "string") {
    return Response.json({ error: "Photo is missing." }, { status: 400 });
  }
  if (!photoDataUrl.startsWith("data:image/")) {
    return Response.json(
      { error: "That doesn't look like an image file." },
      { status: 400 }
    );
  }
  // Approximate size from base64 length: bytes ≈ (len * 3) / 4
  const approxBytes = Math.round((photoDataUrl.length * 3) / 4);
  if (approxBytes > MAX_PHOTO_BYTES) {
    return Response.json(
      { error: "Photo is too large. Max 10 MB." },
      { status: 400 }
    );
  }

  const input: OrderInput = {
    email: email.trim().toLowerCase(),
    heroName: heroName.trim(),
    pronouns,
    storySlug,
    companionSlug,
    photoDataUrl,
    ip,
    userAgent,
  };

  try {
    const { orderId } = await createOrder(input);
    // Fire notification in parallel with response — don't block response on
    // notify success, but do await to surface errors to logs.
    await notifyNewOrder(orderId, input).catch((e) => {
      console.error("[orders] notify failed", e);
    });
    console.log(`[orders] created ${orderId} for ${input.storySlug} + ${input.companionSlug}`);
    return Response.json({ ok: true, orderId });
  } catch (err) {
    console.error("[orders] failed", err);
    return Response.json(
      { error: "Something went sideways. Try again?" },
      { status: 500 }
    );
  }
}
