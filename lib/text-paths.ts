/**
 * Convert text to SVG <path> elements using opentype.js.
 *
 * Why: Vercel's serverless sharp ships librsvg + fontconfig + freetype but
 * has zero fonts actually registered and does not honor @font-face data
 * URLs. Any <text> element renders as tofu. Embedding glyph paths in the
 * SVG itself sidesteps font resolution entirely — vips just rasterizes the
 * <path> geometry.
 *
 * Fonts come from lib/fonts.generated.ts (regen with scripts/bundle-fonts.mjs).
 */
import opentype, { type Font } from "opentype.js";
import {
  FRAUNCES_ITALIC_B64,
  NUNITO_REGULAR_B64,
} from "./fonts.generated";

export type FontKey = "sans" | "serif";

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, "base64");
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

let sansFont: Font | null = null;
let serifFont: Font | null = null;

function getFont(key: FontKey): Font {
  if (key === "sans") {
    if (!sansFont) sansFont = opentype.parse(b64ToArrayBuffer(NUNITO_REGULAR_B64));
    return sansFont;
  }
  if (!serifFont) serifFont = opentype.parse(b64ToArrayBuffer(FRAUNCES_ITALIC_B64));
  return serifFont;
}

export function measureTextWidth(
  text: string,
  key: FontKey,
  fontSize: number
): number {
  return getFont(key).getAdvanceWidth(text, fontSize);
}

/**
 * Return a single SVG <path> string whose d-attribute encodes the full text.
 * x/y is the baseline origin of the first glyph.
 */
export function textAsPath(params: {
  text: string;
  font: FontKey;
  fontSize: number;
  x: number;
  y: number;
  fill: string;
}): string {
  const { text, font, fontSize, x, y, fill } = params;
  const f = getFont(font);
  const path = f.getPath(text, x, y, fontSize);
  const d = path.toPathData(2);
  return `<path d="${d}" fill="${fill}"/>`;
}

/**
 * Greedy word-wrap using actual glyph advance widths. Returns the lines to
 * render (caller handles y-positioning).
 */
export function wrapTextByGlyphs(params: {
  text: string;
  font: FontKey;
  fontSize: number;
  firstLineMaxWidth: number;
  restLineMaxWidth: number;
}): string[] {
  const { text, font, fontSize, firstLineMaxWidth, restLineMaxWidth } = params;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const spaceW = measureTextWidth(" ", font, fontSize);
  let maxW = firstLineMaxWidth;
  for (const w of words) {
    const wW = measureTextWidth(w, font, fontSize);
    const candidate = cur ? cur + " " + w : w;
    const candidateW = cur ? measureTextWidth(cur, font, fontSize) + spaceW + wW : wW;
    if (candidateW > maxW && cur) {
      lines.push(cur);
      cur = w;
      maxW = restLineMaxWidth;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
