/**
 * One-shot admin route: attempt ONE FLUX multi-ref page render with a
 * representative payload and return the raw error body on failure.
 *
 * Every real order's FLUX call has been 422-ing with just "Unprocessable
 * Entity" and no detail. This bypasses the router so the FAL error
 * reaches us directly with status/body/promptLen/refCount attached.
 *
 * Deleted after use.
 */
import { generatePage } from "@/lib/fal-flux";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TOKEN = "jsprout-oneshot-probe-flux";

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const root = process.cwd();
  const heroSheet = path.join(root, "public/samples/02-long-way-home-cover.png");
  const companionSheet = path.join(root, "content/companions/thistle.png");
  // Real pipeline passes 2 settings for stories like long-way-home (garden + reef).
  const setting1 = path.join(root, "content/settings/02-long-way-home/garden.png");
  const setting2 = path.join(root, "content/settings/02-long-way-home/reef.png");

  try {
    const buf = await generatePage({
      heroSheet: { type: "file", path: heroSheet },
      companionSheet: { type: "file", path: companionSheet },
      settingSheets: [
        { type: "file", path: setting1 },
        { type: "file", path: setting2 },
      ],
      brief:
        "A sunny zoo plaza in warm morning light. The hero child and the owl companion walk past the red-and-white striped zoo gate, looking up with happy curious expressions.",
      textPosition: "bottom",
      heroFeatures: JSON.stringify({
        hair: "platinum-blonde tight ringlet curls, shoulder-length, hair down",
        accessories: "none",
        eyes: "blue-gray",
        face: "round toddler face with pudgy cheeks",
        nose: "small button nose",
        mouth: "small closed smile",
        skin: "warm-fair",
        build: "about 3 years old, 3 heads tall",
        outfit: "lavender tee, cream leggings, white sneakers",
      }),
      heroAge: 3,
      canonicalOutfit:
        "soft lavender short-sleeve puff-sleeve tee, cream stretch leggings, white lace-up sneakers with white soles, no prints, no logos, no text",
    });

    return Response.json({ ok: true, sizeBytes: buf.length });
  } catch (err) {
    const e = err as Error;
    return Response.json({ ok: false, message: e.message, stack: e.stack?.split("\n").slice(0, 5).join("\n") }, { status: 500 });
  }
}
