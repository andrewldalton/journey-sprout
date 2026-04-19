/**
 * Image-generation provider router.
 *
 * Picks between FLUX.1 Kontext (via Fal.ai), Vertex AI Imagen 3 Customization,
 * and Gemini 2.5 Flash Image based on env flag IMAGE_PROVIDER
 * ("flux" | "vertex" | "gemini").
 *
 * Default picking:
 *   1. FAL_KEY present → "flux"
 *   2. GOOGLE_APPLICATION_CREDENTIALS_JSON + GOOGLE_CLOUD_PROJECT present → "vertex"
 *   3. Otherwise → "gemini"
 *
 * Per-call fallback: if the primary provider throws, we log and retry on
 * the next provider in priority order (flux → vertex → gemini) so a bad
 * deploy / quota hit / allowlist denial doesn't brick in-flight orders.
 */
import * as gemini from "./gemini";
import * as vertex from "./vertex-imagen";
import * as flux from "./fal-flux";

type Provider = "flux" | "vertex" | "gemini";

// Narrow "just the image-gen ops" interface. gemini exports extras
// (describeHero) that aren't part of the provider contract.
type ImageProvider = {
  generateCharacterSheet: typeof gemini.generateCharacterSheet;
  generatePage: typeof gemini.generatePage;
  generateCover: typeof gemini.generateCover;
};

function pick(): Provider {
  const forced = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (forced === "flux" || forced === "vertex" || forced === "gemini") return forced;
  if (process.env.FAL_KEY) return "flux";
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && process.env.GOOGLE_CLOUD_PROJECT) {
    return "vertex";
  }
  return "gemini";
}

function mod(p: Provider): ImageProvider {
  if (p === "flux") return flux;
  if (p === "vertex") return vertex;
  return gemini;
}

const FALLBACK_ORDER: Record<Provider, Provider[]> = {
  flux: ["vertex", "gemini"],
  vertex: ["flux", "gemini"],
  gemini: ["flux", "vertex"],
};

async function withFallback<T>(
  label: string,
  primary: Provider,
  run: (m: ImageProvider) => Promise<T>
): Promise<T> {
  const tried: Provider[] = [primary];
  try {
    return await run(mod(primary));
  } catch (err) {
    console.warn(
      `[image-gen] ${label} failed on ${primary}:`,
      (err as Error).message
    );
    for (const secondary of FALLBACK_ORDER[primary]) {
      if (tried.includes(secondary)) continue;
      tried.push(secondary);
      try {
        console.warn(`[image-gen] ${label} falling back to ${secondary}`);
        return await run(mod(secondary));
      } catch (err2) {
        console.warn(
          `[image-gen] ${label} also failed on ${secondary}:`,
          (err2 as Error).message
        );
      }
    }
    throw err;
  }
}

export const generateCharacterSheet: typeof gemini.generateCharacterSheet = (params) =>
  withFallback("sheet", pick(), (m) => m.generateCharacterSheet(params));

export const generatePage: typeof gemini.generatePage = (params) =>
  withFallback("page", pick(), (m) => m.generatePage(params));

export const generateCover: typeof gemini.generateCover = (params) =>
  withFallback("cover", pick(), (m) => m.generateCover(params));
