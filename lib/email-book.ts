/**
 * Customer-facing "your book is ready" email. Sent from the Inngest
 * pipeline at the end of a successful render. Mirrors the polished
 * template used by the local send-book-email.mjs script.
 */
import { Resend } from "resend";
import { fetchBytes } from "./blob";
import { COMPANIONS } from "./catalog";

const SITE_URL = "https://journeysprout.vercel.app";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

export async function sendBookReadyEmail(params: {
  to: string;
  heroName: string;
  title: string;
  companionSlug: string;
  coverUrl: string;
  pdfUrl: string;
}): Promise<string> {
  const { to, heroName, title, companionSlug, coverUrl, pdfUrl } = params;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const companion = COMPANIONS.find((c) => c.slug === companionSlug);
  const companionName = companion?.name ?? companionSlug;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "journeysprout <onboarding@resend.dev>";
  const subject = `${heroName}'s journeysprout book is ready`;
  const preheader = `An AI-illustrated watercolor picture book, painted just for ${heroName}.`;

  // Download the PDF so Resend can attach it (Resend accepts base64 content OR a URL — we use base64 for reliability).
  const pdfBuffer = await fetchBytes(pdfUrl);
  const pdfFilename = `${heroName} - ${title}.pdf`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3e7c4;font-family:Georgia,'Times New Roman',serif;color:#2d1b0f;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  ${escapeHtml(preheader)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3e7c4;">
  <tr>
    <td align="center" style="padding:32px 16px 8px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fdf5e0;border-radius:20px;overflow:hidden;border:1px solid #d9c9a7;">
        <tr><td align="center" style="padding:32px 24px 8px 24px;">
          <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.32em;color:#b26a6a;text-transform:uppercase;">A journeysprout story</div>
        </td></tr>
        <tr><td align="center" style="padding:12px 24px 20px 24px;">
          <img src="${coverUrl}" alt="${escapeHtml(title)} — cover" width="480" style="display:block;width:100%;max-width:480px;height:auto;border-radius:16px;box-shadow:0 24px 48px -24px rgba(45,27,15,0.35);">
        </td></tr>
        <tr><td style="padding:16px 40px 0 40px;">
          <h1 style="margin:0 0 14px 0;font-family:Georgia,serif;font-style:italic;font-weight:700;color:#2d1b0f;font-size:30px;line-height:1.15;">${escapeHtml(title)}</h1>
          <div style="margin:0 0 24px 0;display:inline-block;">
            <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#c9672a;margin-right:6px;vertical-align:middle;"></span>
            <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#c9672a;margin-right:6px;vertical-align:middle;"></span>
            <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#c9672a;vertical-align:middle;"></span>
          </div>
          <p style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:17px;line-height:1.55;">Hi there,</p>
          <p style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:17px;line-height:1.55;"><strong>${escapeHtml(heroName)}'s</strong> picture book is ready. <em>${escapeHtml(title)}</em> — ten watercolor pages plus a cover, illustrated by our AI from your photo, with <strong>${escapeHtml(companionName)}</strong> painted at ${escapeHtml(heroName)}'s side on every page.</p>
          <p style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:17px;line-height:1.55;">Here&rsquo;s the best part: open it on a tablet tonight and watch ${escapeHtml(heroName)}&rsquo;s face when they spot themselves in a real picture book. That&rsquo;s the whole reason we made this.</p>
          <p style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:17px;line-height:1.55;">The PDF is attached. Read it aloud tonight, or print a copy on letter-size paper — it&rsquo;s yours to keep forever.</p>
        </td></tr>
        <tr><td style="padding:8px 40px 24px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7edd0;border:1px solid #d9c9a7;border-radius:14px;">
            <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#2d1b0f;line-height:1.55;">
              <div style="color:#6e4a22;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Your book</div>
              <div><strong>Title:</strong> ${escapeHtml(title)}</div>
              <div><strong>Hero:</strong> ${escapeHtml(heroName)}</div>
              <div><strong>Companion:</strong> ${escapeHtml(companionName)}</div>
              <div><strong>Pages:</strong> 10 + cover</div>
              <div><strong>Format:</strong> PDF, letter-size friendly</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 24px 40px;">
          <h2 style="margin:0 0 10px 0;font-family:Georgia,serif;font-style:italic;font-weight:700;color:#2d1b0f;font-size:20px;line-height:1.2;">A few things you can do with it</h2>
          <ul style="margin:0 0 8px 0;padding:0 0 0 20px;font-family:Georgia,serif;font-size:16px;line-height:1.55;">
            <li style="margin-bottom:8px;">Read it tonight. Every journeysprout story is tuned for a bedtime cadence — and for that giggle when they realize it&rsquo;s them on the page.</li>
            <li style="margin-bottom:8px;">Print and staple a keepsake copy — letter-size, folded in half, works beautifully.</li>
            <li style="margin-bottom:8px;">Want a proper hardcover? We're rolling out print-on-demand soon. Hit reply if you'd like one.</li>
          </ul>
        </td></tr>
        <tr><td style="padding:0 40px 32px 40px;">
          <p style="margin:0 0 4px 0;font-family:Georgia,serif;font-size:17px;line-height:1.55;">Made with warm paint,</p>
          <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:20px;line-height:1.2;">journeysprout</p>
        </td></tr>
        <tr><td style="padding:20px 40px 28px 40px;border-top:1px solid #d9c9a7;">
          <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6e4a22;line-height:1.55;"><strong style="color:#2d1b0f;">journeysprout</strong> &middot; AI-illustrated watercolor picture books, painted one at a time for one small reader.</p>
          <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6e4a22;line-height:1.55;">Omaha, Nebraska &middot; <a href="${SITE_URL}" style="color:#6e4a22;text-decoration:underline;">${SITE_URL.replace(/^https?:\/\//, "")}</a> &middot; <a href="mailto:hello@journeysprout.com" style="color:#6e4a22;text-decoration:underline;">hello@journeysprout.com</a></p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a7a44;line-height:1.55;">You're receiving this because you ordered a book at journeysprout. Reply to this email to opt out anytime.</p>
        </td></tr>
      </table>
      <p style="margin:12px 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a7a44;">Your book is attached as a PDF.</p>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = `${heroName}'s journeysprout book is ready.

Hi there,

${heroName}'s picture book is ready. "${title}" — ten watercolor pages plus a cover, illustrated by our AI from your photo, with ${companionName} painted at ${heroName}'s side on every page.

Open it on a tablet tonight and watch ${heroName}'s face when they spot themselves in a real picture book. That's the whole reason we made this.

The PDF is attached to this email. Read it aloud tonight, or print a copy on letter-size paper — it's yours to keep forever.

Your book
  Title: ${title}
  Hero: ${heroName}
  Companion: ${companionName}
  Pages: 10 + cover
  Format: PDF, letter-size friendly

Made with warm paint,
journeysprout
—
journeysprout · AI-illustrated watercolor picture books, painted one at a time for one small reader.
Omaha, Nebraska · ${SITE_URL} · hello@journeysprout.com
Reply to this email to opt out anytime.
`;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
    attachments: [
      {
        filename: pdfFilename,
        content: pdfBuffer.toString("base64"),
      },
    ],
  });

  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  return data?.id ?? "unknown";
}

/**
 * "Your hero portrait is ready — come take a look" email. Fires after
 * phase 1 of the pipeline. Points the customer at /book/[id] where they
 * can approve the sheet or try again.
 */
export async function sendSheetReadyEmail(params: {
  to: string;
  orderId: string;
  heroName: string;
  sheetUrl: string;
}): Promise<string> {
  const { to, orderId, heroName, sheetUrl } = params;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "journeysprout <onboarding@resend.dev>";
  const subject = `${heroName}'s portrait is ready — take a look`;
  const reviewUrl = `${SITE_URL}/book/${orderId}`;
  const preheader = `Our AI painted ${heroName} in watercolor. If it looks right, we'll make the book.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3e7c4;font-family:Georgia,'Times New Roman',serif;color:#2d1b0f;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3e7c4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fdf5e0;border-radius:20px;overflow:hidden;border:1px solid #d9c9a7;">
      <tr><td align="center" style="padding:28px 24px 4px 24px;">
        <div style="font-family:Georgia,serif;font-size:12px;letter-spacing:0.32em;color:#b26a6a;text-transform:uppercase;">A first look</div>
      </td></tr>
      <tr><td style="padding:10px 36px 0 36px;" align="center">
        <h1 style="margin:0 0 6px 0;font-family:Georgia,serif;font-style:italic;font-weight:700;color:#2d1b0f;font-size:28px;line-height:1.2;">
          ${escapeHtml(heroName)}'s portrait is ready.
        </h1>
        <p style="margin:14px 0 22px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#4a3220;">
          Our AI illustrator painted ${escapeHtml(heroName)} in watercolor from your photo. Come say hello — if it looks like your little one, we'll paint the full book. If not, we'll try again.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:4px 36px 20px 36px;">
        <img src="${escapeHtml(sheetUrl)}" alt="${escapeHtml(heroName)}" width="360" style="display:block;max-width:100%;height:auto;border-radius:14px;border:1px solid #d9c9a7;"/>
      </td></tr>
      <tr><td align="center" style="padding:0 36px 28px 36px;">
        <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#c9672a;color:#fdf5e0;font-family:Georgia,serif;font-weight:600;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:999px;">
          Take a look →
        </a>
      </td></tr>
      <tr><td style="padding:12px 36px 26px 36px;border-top:1px solid #d9c9a7;text-align:center;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a7a44;line-height:1.55;">
          <strong style="color:#2d1b0f;">journeysprout</strong> · AI-illustrated watercolor picture books
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
  if (error) throw new Error(`Resend sheet email failed: ${JSON.stringify(error)}`);
  return data?.id ?? "unknown";
}
