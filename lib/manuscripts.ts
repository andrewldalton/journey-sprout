/**
 * Parse manuscript.md files (story, pages, cover brief) from content/stories/.
 * Also resolves the setting sheets for a given story from content/settings/.
 *
 * The regex + token structure mirrors render-book.mjs in the story-hero-prototype
 * repo, which is the canonical source. Keep in sync if that file evolves.
 */
import fs from "node:fs";
import path from "node:path";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const STORIES_ROOT = path.join(CONTENT_ROOT, "stories");
const SETTINGS_ROOT = path.join(CONTENT_ROOT, "settings");
const COMPANIONS_ROOT = path.join(CONTENT_ROOT, "companions");

export type Page = {
  num: number;
  text: string;
  textPosition: "top" | "bottom";
  brief: string;
};

export type Manuscript = {
  slug: string;
  title: string;
  pages: Page[];
  coverBrief: string | null;
};

export type TokenContext = {
  heroName: string;
  heroSubject: string;   // "she" / "he" / "they"
  heroObject: string;    // "her" / "him" / "them"
  companionName: string;
};

function cap(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Apply {HERO}, {she/She}, {her/Her}, {COMPANION_NAME} token replacements. */
export function applyTokens(s: string, ctx: TokenContext): string {
  return s
    .replaceAll("{COMPANION_NAME}", ctx.companionName)
    .replaceAll("{HERO}", ctx.heroName)
    .replaceAll("{She}", cap(ctx.heroSubject))
    .replaceAll("{she}", ctx.heroSubject)
    .replaceAll("{Her}", cap(ctx.heroObject))
    .replaceAll("{her}", ctx.heroObject);
}

/** Pronouns slug → sub/obj words. */
export function pronounsFromSlug(
  slug: string
): { subject: string; object: string } {
  switch (slug) {
    case "he-him":
      return { subject: "he", object: "him" };
    case "they-them":
      return { subject: "they", object: "them" };
    case "she-her":
    default:
      return { subject: "she", object: "her" };
  }
}

const PAGE_RE =
  /### PAGE (\d+)\s*\n+\*\*TEXT:\*\*\s*\n([\s\S]+?)\n\s*(?:\*\*TEXT_POSITION:\*\*\s*([a-zA-Z]+)\s*\n+)?\*\*ILLUSTRATION BRIEF:\*\*\s*\n([\s\S]+?)\n\s*\*\*PAGE TURN HOOK:\*\*/g;

export function loadManuscript(slug: string, ctx: TokenContext): Manuscript {
  const file = path.join(STORIES_ROOT, slug, "manuscript.md");
  if (!fs.existsSync(file)) {
    throw new Error(`Manuscript not found: ${slug}`);
  }
  const ms = fs.readFileSync(file, "utf8");

  const titleMatch = ms.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  const title = (titleMatch ? titleMatch[1].replace(/["']+$/, "") : slug).trim();

  const coverMatch = ms.match(/^##\s*COVER\s*\n+([\s\S]+?)(?=\n##|\n---|$)/m);
  const coverBrief = coverMatch ? applyTokens(coverMatch[1].trim(), ctx) : null;

  const pages: Page[] = [];
  let m: RegExpExecArray | null;
  PAGE_RE.lastIndex = 0;
  while ((m = PAGE_RE.exec(ms)) !== null) {
    const pos = (m[3] || "top").toLowerCase();
    pages.push({
      num: parseInt(m[1], 10),
      text: applyTokens(m[2].trim(), ctx),
      textPosition: pos === "bottom" ? "bottom" : "top",
      brief: applyTokens(m[4].trim(), ctx),
    });
  }
  if (!pages.length) {
    throw new Error(`No pages parsed from manuscript: ${slug}`);
  }
  pages.sort((a, b) => a.num - b.num);

  return { slug, title, pages, coverBrief };
}

/** Return absolute paths to every PNG in content/settings/<slug>/. */
export function settingSheetPaths(slug: string): string[] {
  const dir = path.join(SETTINGS_ROOT, slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .map((f) => path.join(dir, f));
}

/** Absolute path to a companion's character sheet PNG. */
export function companionSheetPath(slug: string): string {
  const file = path.join(COMPANIONS_ROOT, `${slug}.png`);
  if (!fs.existsSync(file)) {
    throw new Error(`Companion sheet not found: ${slug}`);
  }
  return file;
}
