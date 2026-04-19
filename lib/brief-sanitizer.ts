/**
 * Server-side brief sanitizer. Rewrites verbs/phrases known to trip
 * FLUX.1 Kontext's Pixtral safety filter (which returns black images at
 * HTTP 200 regardless of safety_tolerance). Applied to every page + cover
 * brief before it reaches the image provider.
 *
 * Pattern list is a superset of the one-shot manuscript audit — storytellers
 * shouldn't have to memorize FLUX's filter; this pass enforces the rules
 * mechanically and logs what it changed for debugging.
 *
 * Triggers researched 2026-04 from BFL docs + community reports. Filter
 * targets: visible real-child photo as reference + any vector toward
 * nudity/violence/peril/realistic-predator-proximity.
 */

type Sub = [pattern: RegExp, replacement: string, reason: string];

const SUBSTITUTIONS: Sub[] = [
  // Anatomy language — predator/prey framing
  [/\bclaws?\b/gi, "paw", "claw→paw"],
  [/\bfangs?\b/gi, "teeth", "fang→teeth"],
  [/\bbared\s+(teeth|fangs?)\b/gi, "soft smile", "bared-teeth→soft-smile"],
  [/\bsnarl(ing|ed)?\b/gi, "smiling", "snarl→smile"],
  [/\bgrowl(ing|ed|s)?\b/gi, "humming", "growl→hum"],
  [/\bbit(ing|e|es)\b/gi, "tasting", "bite→taste"],

  // Negations that leak flagged words into the prompt
  [/\bno\s+scary\s+teeth\b/gi, "soft rounded features", "no-scary-teeth→soft-features"],
  [/\bno\s+sharp\s+teeth\b/gi, "soft rounded features", "no-sharp-teeth→soft-features"],
  [/\bno\s+sharks?(\s+\w+)?\b/gi, "", "removed-shark"],
  [/\bshark(s)?\s+silhouette\b/gi, "gentle rounded silhouette", "shark-silhouette→gentle"],
  [/\bno\s+scary\s+/gi, "no ", "removed-scary-modifier"],
  [/\bscary\s+dark\b/gi, "soft twilight", "scary-dark→soft-twilight"],
  [/\bscary\s+night\b/gi, "calm evening", "scary-night→calm-evening"],

  // Undressed / minor-exposure triggers
  [/\bbare\s+(feet|foot)\b/gi, "sneakered feet", "bare-feet→sneakered-feet"],
  [/\bbare\s+(legs?|arms?|chest|body|skin)\b/gi, "clothed", "bare-body→clothed"],
  [/\bnaked\b/gi, "clothed", "naked→clothed"],
  [/\bnude\b/gi, "clothed", "nude→clothed"],
  [/\bundressed\b/gi, "clothed", "undressed→clothed"],
  [/\bdiapers?\b/gi, "shorts", "diaper→shorts"],

  // Bath / water-around-child triggers
  [/\bbathtubs?\b/gi, "fountain", "bathtub→fountain"],
  [/\bbathrooms?\b/gi, "hallway", "bathroom→hallway"],
  [/\bbathing\b/gi, "wading", "bathing→wading"],
  [/\bwet\s+(sand|clothes|shirt|hair|skin)\b/gi, "dry $1", "wet-$1→dry-$1"],
  [/\bswimming\b/gi, "drifting", "swim→drift"],
  [/\bsubmerged\b/gi, "afloat", "submerged→afloat"],

  // Restraint / peril / violence
  [/\bgrab(bed|bing)?\b/gi, "reach", "grab→reach"],
  [/\bcarried\s+in\s+(his|her|their|its)\s+(mouth|teeth|jaws|arms)\b/gi, "walking beside", "carried-in→walking-beside"],
  [/\bwrapped\s+around\b/gi, "curled near", "wrapped-around→curled-near"],
  [/\bpinned\b/gi, "resting", "pinned→resting"],
  [/\btied\s+up\b/gi, "held gently", "tied-up→held-gently"],

  // Distress / injury
  [/\bcrying\b/gi, "quiet", "crying→quiet"],
  [/\btears\s+stream(ing|ed)?\b/gi, "soft smile", "tears-streaming→soft-smile"],
  [/\bscream(s|ing|ed)?\b/gi, "calling", "scream→call"],
  [/\bhurt\b/gi, "tired", "hurt→tired"],
  [/\binjured\b/gi, "tired", "injured→tired"],
  [/\bbleed(ing|s)?\b/gi, "", "removed-bleed"],
  [/\bblood(y|ied)?\b/gi, "", "removed-blood"],
  [/\bwound(s|ed)?\b/gi, "", "removed-wound"],

  // Peril framing
  [/\blost\s+in\s+the\s+dark\b/gi, "paused in the twilight", "lost-in-dark→paused-twilight"],
  [/\balone\s+in\s+the\s+dark\b/gi, "quiet in the twilight", "alone-in-dark→quiet-twilight"],
  [/\bseparated\s+from\s+(parents?|mom|dad|mother|father|family)\b/gi, "walking forward", "separated-from-parents→walking-forward"],
  [/\bterrified\b/gi, "paused", "terrified→paused"],
  [/\bfrightened\b/gi, "paused", "frightened→paused"],

  // Dead things
  [/\bdead\s+(animals?|birds?|creatures?|bodies?)\b/gi, "sleeping $1", "dead→sleeping"],
  [/\bcorpse(s)?\b/gi, "sleeping shape", "corpse→sleeping-shape"],
  [/\bskeletons?\b/gi, "fossil", "skeleton→fossil"],

  // Weapons
  [/\b(guns?|rifles?|pistols?|swords?|knives?|knife|daggers?)\b/gi, "wooden stick", "weapon→stick"],
];

export type SanitizeResult = {
  sanitized: string;
  changes: string[];
};

export function sanitizeBrief(brief: string): SanitizeResult {
  let out = brief;
  const changes: string[] = [];
  for (const [pattern, replacement, reason] of SUBSTITUTIONS) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) changes.push(reason);
  }
  // Collapse double spaces and awkward spacing left by empty replacements.
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;])/g, "$1");
  return { sanitized: out, changes };
}
