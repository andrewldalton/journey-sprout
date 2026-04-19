import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
const db = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1];
const sql = postgres(db, { ssl: "require" });

// Current latest order id — we'll wait for something newer than this.
const start = await sql`SELECT id, created_at FROM orders ORDER BY created_at DESC LIMIT 1`;
const baseline = start[0]?.created_at ?? new Date(0);
console.log(`Waiting for a new order submitted after ${baseline.toISOString()}...`);

let target = null;
let lastSig = "";
while (true) {
  const rows = await sql`SELECT id, hero_name, hero_age, story_slug, companion_slug, status, sheet_status, sheet_url IS NOT NULL AS has_sheet, sheet_description IS NOT NULL AS has_desc, pages_done, pages_total, error, created_at FROM orders WHERE created_at > ${baseline} ORDER BY created_at DESC LIMIT 1`;
  if (rows.length > 0) {
    const r = rows[0];
    if (!target) {
      target = r.id;
      console.log(`NEW ORDER: ${r.id} — ${r.hero_name} (age ${r.hero_age ?? "?"}) on ${r.story_slug} + ${r.companion_slug}`);
    }
    const sig = `${r.status}|${r.sheet_status}|${r.has_sheet}|${r.has_desc}|${r.pages_done}`;
    if (sig !== lastSig) {
      const t = Math.round((Date.now() - new Date(r.created_at).getTime()) / 1000);
      console.log(`[${t}s] status=${r.status} sheet_status=${r.sheet_status} sheet=${r.has_sheet?"Y":"-"} desc=${r.has_desc?"Y":"-"} pages=${r.pages_done}/${r.pages_total} err=${r.error ?? "-"}`);
      lastSig = sig;
    }
    if (r.status === "emailed" || r.status === "failed") {
      // Dump the sheet_description for Andrew.
      const full = await sql`SELECT sheet_description FROM orders WHERE id=${r.id}`;
      console.log("=== SHEET DESCRIPTION ===");
      console.log(full[0]?.sheet_description ?? "(none)");
      console.log("=== URLS ===");
      console.log(`sheet: https://bmc7emanmiz3agao.public.blob.vercel-storage.com/orders/${r.id}/sheet.png`);
      for (const p of ["p01","p02","p03","p04","p05","p06","p07","p08","p09","p10","cover"]) {
        console.log(`${p}: https://bmc7emanmiz3agao.public.blob.vercel-storage.com/orders/${r.id}/${p}.png`);
      }
      break;
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}
await sql.end();
