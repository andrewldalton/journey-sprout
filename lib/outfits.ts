/**
 * Canonical outfit buckets chosen by pronouns + age.
 *
 * We deliberately ignore whatever the child wears in the uploaded photo.
 * Real clothing has patterns, logos, and jersey numbers that diffusion
 * models can't reproduce — FLUX in particular drifts or drops text, and
 * our QA loop then flags every page for outfit mismatch. Swapping to a
 * small catalog of simple, text-free outfits makes the OUTFIT line of
 * every prompt deterministic and gives FLUX something it can actually
 * render consistently across 10 pages + cover.
 *
 * Trade: parents lose "they're in their favorite shirt" delight in
 * exchange for a book where the kid looks like the kid on every page.
 */

export type CanonicalOutfitId =
  | "younger-girl"
  | "older-girl"
  | "younger-boy"
  | "older-boy"
  | "younger-neutral"
  | "older-neutral";

export type CanonicalOutfit = {
  id: CanonicalOutfitId;
  /** Dense phrase suitable for dropping straight into image prompts. */
  description: string;
};

const CATALOG: Record<CanonicalOutfitId, CanonicalOutfit> = {
  "younger-girl": {
    id: "younger-girl",
    description:
      "soft lavender short-sleeve puff-sleeve tee, cream stretch leggings, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
  "older-girl": {
    id: "older-girl",
    description:
      "sage-green short-sleeve crew tee, medium-wash denim shorts cuffed at the hem, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
  "younger-boy": {
    id: "younger-boy",
    description:
      "marigold-yellow short-sleeve crew tee, olive-green cotton cargo shorts, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
  "older-boy": {
    id: "older-boy",
    description:
      "navy-blue short-sleeve crew tee, tan cotton shorts, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
  "younger-neutral": {
    id: "younger-neutral",
    description:
      "warm-red short-sleeve crew tee, heather-grey cotton shorts, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
  "older-neutral": {
    id: "older-neutral",
    description:
      "mustard-yellow short-sleeve crew tee, medium-wash denim shorts cuffed at the hem, white lace-up sneakers with white soles, no prints, no logos, no text",
  },
};

export function pickOutfit(
  pronouns: string | null | undefined,
  age: number | null | undefined
): CanonicalOutfit {
  const young = (age ?? 3) <= 4;
  const p = (pronouns ?? "").toLowerCase();
  if (p === "she-her" || p === "she/her") return CATALOG[young ? "younger-girl" : "older-girl"];
  if (p === "he-him" || p === "he/him") return CATALOG[young ? "younger-boy" : "older-boy"];
  return CATALOG[young ? "younger-neutral" : "older-neutral"];
}
