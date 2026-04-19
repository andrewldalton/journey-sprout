/**
 * Image-generation provider router.
 *
 * Picks between Vertex AI Imagen 3 Customization and Gemini 2.5 Flash Image
 * based on env flag IMAGE_PROVIDER ("vertex" | "gemini"). Defaults to
 * "vertex" when GOOGLE_APPLICATION_CREDENTIALS_JSON is present, else
 * falls back to "gemini".
 *
 * Per-call fallback: if the primary provider throws, we log and retry the
 * same call against the secondary provider so a bad deploy / quota hit
 * doesn't brick in-flight orders.
 */
import * as gemini from "./gemini";
import * as vertex from "./vertex-imagen";

type Provider = "vertex" | "gemini";

function pick(): Provider {
  const forced = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (forced === "vertex" || forced === "gemini") return forced;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && process.env.GOOGLE_CLOUD_PROJECT) {
    return "vertex";
  }
  return "gemini";
}

function mod(p: Provider) {
  return p === "vertex" ? vertex : gemini;
}

async function withFallback<T>(
  label: string,
  primary: Provider,
  run: (m: typeof gemini) => Promise<T>
): Promise<T> {
  try {
    return await run(mod(primary));
  } catch (err) {
    const secondary: Provider = primary === "vertex" ? "gemini" : "vertex";
    console.warn(
      `[image-gen] ${label} failed on ${primary}, falling back to ${secondary}:`,
      (err as Error).message
    );
    return run(mod(secondary));
  }
}

export const generateCharacterSheet: typeof gemini.generateCharacterSheet = (params) =>
  withFallback("sheet", pick(), (m) => m.generateCharacterSheet(params));

export const generatePage: typeof gemini.generatePage = (params) =>
  withFallback("page", pick(), (m) => m.generatePage(params));

export const generateCover: typeof gemini.generateCover = (params) =>
  withFallback("cover", pick(), (m) => m.generateCover(params));
