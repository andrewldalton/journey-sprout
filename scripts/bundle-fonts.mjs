/**
 * Regenerates lib/fonts.generated.ts from the TTFs in content/fonts/.
 * Run manually whenever fonts are added/updated:
 *   node scripts/bundle-fonts.mjs
 *
 * We embed the fonts as base64 TS constants so Vercel's serverless runtime
 * doesn't depend on Next.js file-tracing picking up *.ttf files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const nunito = readFileSync(path.join(root, "content/fonts/Nunito-Regular.ttf")).toString("base64");
const fraunces = readFileSync(path.join(root, "content/fonts/Fraunces-Italic.ttf")).toString("base64");

const body = `/**
 * Auto-generated from content/fonts/*.ttf — do not edit by hand.
 * Regenerate with: node scripts/bundle-fonts.mjs
 *
 * Fonts are embedded as base64 constants here so Vercel's serverless
 * runtime has them without relying on Next.js file-tracing.
 */

export const NUNITO_REGULAR_B64 = "${nunito}";
export const FRAUNCES_ITALIC_B64 = "${fraunces}";
`;

writeFileSync(path.join(root, "lib/fonts.generated.ts"), body);
console.log(`wrote lib/fonts.generated.ts (${body.length} bytes)`);
