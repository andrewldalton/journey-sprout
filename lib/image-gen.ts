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
import { logCostEvent, type CostKind } from "./cost";

type Provider = "flux" | "vertex" | "gemini";

// Narrow "just the image-gen ops" interface. gemini exports extras
// (describeHero) that aren't part of the provider contract.
type ImageProvider = {
  generateCharacterSheet: typeof gemini.generateCharacterSheet;
  generatePage: typeof gemini.generatePage;
  generateCover: typeof gemini.generateCover;
};

// Model id per provider for cost-event logging. `flux` uses two endpoints
// (single-ref for sheet, multi-ref for page/cover); we log whichever the
// provider actually hit based on the `kind`.
const MODEL_ID: Record<Provider, Record<CostKind, string>> = {
  gemini: {
    sheet: "gemini-2.5-flash-image",
    page:  "gemini-2.5-flash-image",
    cover: "gemini-2.5-flash-image",
  },
  vertex: {
    sheet: "imagen-3.0-capability-preview-0930",
    page:  "imagen-3.0-capability-preview-0930",
    cover: "imagen-3.0-capability-preview-0930",
  },
  flux: {
    sheet: "fal-ai/flux-pro/kontext",
    page:  "fal-ai/flux-pro/kontext/multi",
    cover: "fal-ai/flux-pro/kontext/multi",
  },
};

export type GenMeta = {
  orderId?: string | null;
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

async function runAndLog<T>(
  provider: Provider,
  kind: CostKind,
  meta: GenMeta | undefined,
  run: (m: ImageProvider) => Promise<T>,
  fallbackFrom: Provider | null = null
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run(mod(provider));
    const durationMs = Date.now() - startedAt;
    // Fire-and-forget — logCostEvent swallows its own errors.
    void logCostEvent({
      orderId: meta?.orderId ?? null,
      kind,
      provider,
      model: MODEL_ID[provider][kind],
      durationMs,
      status: "success",
      fallbackFrom,
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    void logCostEvent({
      orderId: meta?.orderId ?? null,
      kind,
      provider,
      model: MODEL_ID[provider][kind],
      durationMs,
      status: "failed",
      errorMessage: (err as Error).message,
      fallbackFrom,
    });
    throw err;
  }
}

async function withFallback<T>(
  kind: CostKind,
  primary: Provider,
  meta: GenMeta | undefined,
  run: (m: ImageProvider) => Promise<T>
): Promise<T> {
  const tried: Provider[] = [primary];
  try {
    return await runAndLog(primary, kind, meta, run, null);
  } catch (err) {
    console.warn(
      `[image-gen] ${kind} failed on ${primary}:`,
      (err as Error).message
    );
    for (const secondary of FALLBACK_ORDER[primary]) {
      if (tried.includes(secondary)) continue;
      tried.push(secondary);
      try {
        console.warn(`[image-gen] ${kind} falling back to ${secondary}`);
        return await runAndLog(secondary, kind, meta, run, primary);
      } catch (err2) {
        console.warn(
          `[image-gen] ${kind} also failed on ${secondary}:`,
          (err2 as Error).message
        );
      }
    }
    throw err;
  }
}

type SheetArgs = Parameters<typeof gemini.generateCharacterSheet>[0];
type PageArgs = Parameters<typeof gemini.generatePage>[0];
type CoverArgs = Parameters<typeof gemini.generateCover>[0];

export const generateCharacterSheet = (params: SheetArgs, meta?: GenMeta) =>
  withFallback("sheet", pick(), meta, (m) => m.generateCharacterSheet(params));

export const generatePage = (params: PageArgs, meta?: GenMeta) =>
  withFallback("page", pick(), meta, (m) => m.generatePage(params));

export const generateCover = (params: CoverArgs, meta?: GenMeta) =>
  withFallback("cover", pick(), meta, (m) => m.generateCover(params));
