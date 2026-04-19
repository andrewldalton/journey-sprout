import sharp from "sharp";
import {
  FRAUNCES_ITALIC_B64,
  NUNITO_REGULAR_B64,
} from "@/lib/fonts.generated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fontFaceCss = [
    `@font-face{font-family:'JSSans';src:url(data:font/ttf;base64,${NUNITO_REGULAR_B64}) format('truetype');font-weight:400;font-style:normal;}`,
    `@font-face{font-family:'JSSerif';src:url(data:font/ttf;base64,${FRAUNCES_ITALIC_B64}) format('truetype');font-weight:400;font-style:italic;}`,
  ].join("\n");

  const svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${fontFaceCss}</style></defs>
  <rect x="0" y="0" width="800" height="400" fill="#fdf5e0"/>
  <text x="40" y="80" font-family="JSSans, sans-serif" font-size="36" fill="#2d1b0f">JSSans quick brown fox 0123</text>
  <text x="40" y="150" font-family="JSSerif, serif" font-size="42" font-style="italic" fill="#c9672a">JSSerif italic fox jumps</text>
  <text x="40" y="220" font-family="sans-serif" font-size="36" fill="#2d1b0f">generic sans-serif quick brown</text>
  <text x="40" y="290" font-family="serif" font-size="36" fill="#2d1b0f">generic serif quick brown</text>
  <rect x="40" y="310" width="40" height="40" fill="#5a8a3e"/>
  <rect x="100" y="310" width="40" height="40" fill="#b26a6a"/>
  <rect x="160" y="310" width="40" height="40" fill="#c59a3a"/>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  const nunitoBytes = Buffer.from(NUNITO_REGULAR_B64, "base64").length;
  const frauncessBytes = Buffer.from(FRAUNCES_ITALIC_B64, "base64").length;

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Nunito-Bytes": String(nunitoBytes),
      "X-Fraunces-Bytes": String(frauncessBytes),
      "X-Sharp-Versions": JSON.stringify({
        sharp: sharp.versions,
        format: Object.keys(sharp.format ?? {}).slice(0, 5),
      }),
    },
  });
}
