/**
 * Image compositing with `sharp` — text bubble overlays for pages and
 * typographic overlays for covers. Ported from render-book.mjs.
 *
 * IMPORTANT: we do NOT use <text> elements. Vercel's serverless sharp has
 * no fonts registered with fontconfig and doesn't honor @font-face data
 * URLs, so <text> renders as tofu. All text is baked into <path> geometry
 * by lib/text-paths.ts using opentype.js.
 */
import sharp from "sharp";
import {
  measureTextWidth,
  textAsPath,
  wrapTextByGlyphs,
  type FontKey,
} from "./text-paths";

function spacedTextPaths(params: {
  text: string;
  font: FontKey;
  fontSize: number;
  x: number;
  y: number;
  fill: string;
  letterSpacing: number;
  anchor?: "start" | "middle";
}): string {
  const { text, font, fontSize, x, y, fill, letterSpacing, anchor = "start" } = params;
  const chars = [...text];
  const widths = chars.map((c) => measureTextWidth(c, font, fontSize));
  const totalWidth = widths.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, chars.length - 1);
  const startX = anchor === "middle" ? x - totalWidth / 2 : x;
  let cursor = startX;
  const paths: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    paths.push(
      textAsPath({ text: chars[i], font, fontSize, x: cursor, y, fill })
    );
    cursor += widths[i] + letterSpacing;
  }
  return paths.join("");
}

// --- Page text bubble ---

export async function composePageBubble(params: {
  rawImage: Buffer;
  text: string;
  textPosition: "top" | "bottom";
  companionAccent: string;
}): Promise<Buffer> {
  const { rawImage, text, textPosition, companionAccent } = params;
  const img = sharp(rawImage);
  const meta = await img.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const fullText = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const firstChar = fullText[0] ?? "";
  const bodyText = fullText.slice(1).trimStart();

  const lineHeightMul = 1.28;
  const panelSideMargin = Math.round(W * 0.06);
  const panelPadX = Math.round(W * 0.022);
  const panelPadY = Math.round(W * 0.016);
  const panelEdgeMargin = Math.round(H * 0.03);
  const panelMaxHeight = Math.round(H * 0.26);
  const panelWidth = W - 2 * panelSideMargin;
  const panelInnerWidth = panelWidth - 2 * panelPadX;

  let fontSize = Math.round(W * 0.026);
  let dropSize = 0;
  let lineHeight = 0;
  let lines: string[] = [];
  let firstLineIndent = 0;
  for (;; fontSize -= 1) {
    dropSize = Math.round(fontSize * 1.9);
    lineHeight = Math.round(fontSize * lineHeightMul);
    firstLineIndent = Math.round(dropSize * 0.75);
    lines = wrapTextByGlyphs({
      text: bodyText,
      font: "sans",
      fontSize,
      firstLineMaxWidth: panelInnerWidth - firstLineIndent,
      restLineMaxWidth: panelInnerWidth,
    });
    const textBlockH = Math.max(dropSize, lines.length * lineHeight);
    const panelH = textBlockH + 2 * panelPadY;
    if (panelH <= panelMaxHeight || fontSize <= 14) break;
  }

  const textBlockH = Math.max(dropSize, lines.length * lineHeight);
  const panelH = Math.round(textBlockH + 2 * panelPadY);
  const panelX = panelSideMargin;
  const panelY =
    textPosition === "bottom" ? H - panelEdgeMargin - panelH : panelEdgeMargin;

  const innerTop = panelY + panelPadY;
  const dropX = panelX + panelPadX;
  const dropY = innerTop + Math.round(dropSize * 0.82);

  const firstTextBaseline =
    innerTop + Math.round(fontSize * 1.05) + Math.round((dropSize - fontSize) * 0.35);
  const lineXFirst = panelX + panelPadX + firstLineIndent;
  const lineXRest = panelX + panelPadX;

  const linesSvg = lines
    .map((line, i) => {
      const x = i === 0 ? lineXFirst : lineXRest;
      const y = firstTextBaseline + i * lineHeight;
      return textAsPath({
        text: line,
        font: "sans",
        fontSize,
        x,
        y,
        fill: "#2d1b0f",
      });
    })
    .join("\n  ");

  const dropCap = textAsPath({
    text: firstChar,
    font: "sans",
    fontSize: dropSize,
    x: dropX,
    y: dropY,
    fill: companionAccent,
  });

  const corner = Math.round(Math.min(panelH * 0.22, 28));

  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bubbleShadow" x="-10%" y="-10%" width="120%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(W * 0.004)}"/>
      <feOffset dx="0" dy="${Math.round(W * 0.003)}"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelH}"
        rx="${corner}" ry="${corner}"
        fill="rgba(253, 245, 224, 0.94)"
        stroke="rgba(175, 140, 80, 0.45)" stroke-width="1.5"
        filter="url(#bubbleShadow)"/>
  ${dropCap}
  ${linesSvg}
</svg>`.trim();

  return img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

// --- Cover typography overlay ---

export async function composeCoverTypography(params: {
  rawImage: Buffer;
  storyTitle: string;
  heroName: string;
  companionName: string;
  companionAccent: string;
}): Promise<Buffer> {
  const { rawImage, storyTitle, heroName, companionName, companionAccent } = params;
  const img = sharp(rawImage);
  const meta = await img.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const eyebrowText = `${heroName.toUpperCase()} AND ${companionName.toUpperCase()} IN`;
  const seriesLabel = "A JOURNEYSPROUT STORY";

  const titlePadX = Math.round(W * 0.08);
  const titleMaxWidth = W - 2 * titlePadX;

  function wrapTitle(input: string, fs: number): string[] {
    return wrapTextByGlyphs({
      text: input,
      font: "serif",
      fontSize: fs,
      firstLineMaxWidth: titleMaxWidth,
      restLineMaxWidth: titleMaxWidth,
    });
  }

  let titleSize = Math.round(W * 0.054);
  let titleLines: string[] = [];
  for (;; titleSize -= 2) {
    titleLines = wrapTitle(storyTitle, titleSize);
    if (titleLines.length <= 3 || titleSize <= 26) break;
  }
  const titleLineHeight = Math.round(titleSize * 1.06);

  const eyebrowSize = Math.round(W * 0.018);
  const eyebrowSpacing = Math.round(eyebrowSize * 0.28);
  const ruleSize = Math.round(W * 0.016);
  const seriesSize = Math.round(W * 0.015);
  const seriesSpacing = Math.round(seriesSize * 0.32);

  const topPad = Math.round(H * 0.04);
  const afterEyebrow = Math.round(eyebrowSize * 1.6);
  const afterTitle = Math.round(titleSize * 0.45);
  const afterRule = Math.round(ruleSize * 1.7);

  const eyebrowY = topPad + eyebrowSize;
  const titleTopY = eyebrowY + afterEyebrow;
  const titleBaseline0 = titleTopY + Math.round(titleSize * 0.82);
  const titleEnd =
    titleBaseline0 +
    (titleLines.length - 1) * titleLineHeight +
    Math.round(titleSize * 0.18);
  const ruleY = titleEnd + afterTitle;
  const seriesY = ruleY + afterRule;
  const plateBottom = seriesY + Math.round(seriesSize * 0.8);

  const plateSideMargin = Math.round(W * 0.055);
  const plateTop = topPad - Math.round(eyebrowSize * 0.9);
  const plateH = Math.round(plateBottom - plateTop + eyebrowSize * 0.3);
  const plateCorner = Math.round(W * 0.03);

  const dotR = Math.round(ruleSize * 0.28);
  const dotSpacing = Math.round(ruleSize * 1.4);
  const dots = [-1, 0, 1]
    .map(
      (i) =>
        `<circle cx="${W / 2 + i * dotSpacing}" cy="${ruleY}" r="${dotR}" fill="${companionAccent}" opacity="0.85"/>`
    )
    .join("");

  const eyebrowPath = spacedTextPaths({
    text: eyebrowText,
    font: "sans",
    fontSize: eyebrowSize,
    x: W / 2,
    y: eyebrowY,
    fill: companionAccent,
    letterSpacing: eyebrowSpacing,
    anchor: "middle",
  });

  const titlePaths = titleLines
    .map((line, i) => {
      const y = titleBaseline0 + i * titleLineHeight;
      const width = measureTextWidth(line, "serif", titleSize);
      return textAsPath({
        text: line,
        font: "serif",
        fontSize: titleSize,
        x: W / 2 - width / 2,
        y,
        fill: "#2a1810",
      });
    })
    .join("\n  ");

  const seriesPath = spacedTextPaths({
    text: seriesLabel,
    font: "sans",
    fontSize: seriesSize,
    x: W / 2,
    y: seriesY,
    fill: "#6e4a22",
    letterSpacing: seriesSpacing,
    anchor: "middle",
  });

  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="plateShadow" x="-10%" y="-10%" width="120%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(W * 0.005)}"/>
      <feOffset dx="0" dy="${Math.round(W * 0.004)}"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.32"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect x="${plateSideMargin}" y="${plateTop}" width="${W - 2 * plateSideMargin}" height="${plateH}"
        rx="${plateCorner}" ry="${plateCorner}"
        fill="rgba(253, 245, 224, 0.92)"
        stroke="rgba(175, 140, 80, 0.55)" stroke-width="1.8"
        filter="url(#plateShadow)"/>

  ${eyebrowPath}
  ${titlePaths}
  ${dots}
  ${seriesPath}
</svg>`.trim();

  return img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}
