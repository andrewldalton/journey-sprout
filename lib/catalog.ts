/**
 * Shared catalog of stories and companions available in Journey Sprout.
 *
 * This is the source of truth for the book builder flow. Keep in sync with
 * the companion repo at /Users/andrewdalton/CLAUDE/story-hero-prototype/.
 */

export type Companion = {
  slug: string;        // file/companion-sheet key (lowercase)
  name: string;        // Display name
  species: string;     // "bunny", "dragon", etc.
  accent: string;      // Hex color, matches render-book.mjs ACCENTS
  accentName: string;  // Human-readable accent name
  blurb: string;       // Parent-facing picker blurb
  imageSrc: string;    // /companions/<slug>.png
};

export type Story = {
  slug: string;        // matches stories/<slug>/manuscript.md
  title: string;       // Display title from manuscript frontmatter
  theme: string;       // Emotional arc in one line
  pitch: string;       // Parent-facing 1–2 sentence description
  coverSrc?: string;   // Optional sample cover image (only seed for now)
  mood: { bg: string; fg: string }; // Placeholder-card colors when no cover
};

export const COMPANIONS: Companion[] = [
  {
    slug: "willow",
    name: "Willow",
    species: "bunny",
    accent: "#b26a6a",
    accentName: "dusty rose",
    blurb: "A gentle, patient bunny with a quiet heart.",
    imageSrc: "/companions/willow.png",
  },
  {
    slug: "ember",
    name: "Ember",
    species: "dragon",
    accent: "#c14a3b",
    accentName: "apple red",
    blurb: "A brave little dragon with a warm, glowing heart.",
    imageSrc: "/companions/ember.png",
  },
  {
    slug: "juniper",
    name: "Juniper",
    species: "fox",
    accent: "#c67238",
    accentName: "russet orange",
    blurb: "A clever fox who knows every winding path.",
    imageSrc: "/companions/juniper.png",
  },
  {
    slug: "lumen",
    name: "Lumen",
    species: "unicorn",
    accent: "#c59a3a",
    accentName: "warm gold",
    blurb: "A golden unicorn whose quiet glow is a kind of courage.",
    imageSrc: "/companions/lumen.png",
  },
  {
    slug: "sprig",
    name: "Sprig",
    species: "dinosaur",
    accent: "#5a8a3e",
    accentName: "forest green",
    blurb: "A small green dinosaur with an enormous heart.",
    imageSrc: "/companions/sprig.png",
  },
  {
    slug: "thistle",
    name: "Thistle",
    species: "owl",
    accent: "#a67a2a",
    accentName: "amber gold",
    blurb: "A wise owl who listens before she speaks.",
    imageSrc: "/companions/thistle.png",
  },
  {
    slug: "barley",
    name: "Barley",
    species: "bear cub",
    accent: "#9e5a2b",
    accentName: "cinnamon",
    blurb: "A cinnamon bear cub who's always up for adventure.",
    imageSrc: "/companions/barley.png",
  },
  {
    slug: "pebble",
    name: "Pebble",
    species: "turtle",
    accent: "#7a8f3a",
    accentName: "olive gold",
    blurb: "A steady turtle who finds magic in small things.",
    imageSrc: "/companions/pebble.png",
  },
];

export const STORIES: Story[] = [
  {
    slug: "03-seed-took-time",
    title: "The Seed That Took Its Time",
    theme: "Waiting is part of growing.",
    pitch:
      "A story about a child who plants one small seed and discovers that wonderful things happen in their own quiet time.",
    coverSrc: "/samples/seed-cover.png",
    mood: { bg: "#f3e4b8", fg: "#7a5a1a" },
  },
  {
    slug: "01-night-stars",
    title: "The Night the Stars Got Shy",
    theme: "Brave isn't being unafraid. Brave is going anyway.",
    pitch:
      "When the stars vanish from the night sky, your child and a nervous new friend set out to bring them home.",
    mood: { bg: "#2a1f4a", fg: "#f5e6a8" },
  },
  {
    slug: "02-long-way-home",
    title: "The Long Way Home",
    theme: "You already know more than you think you do.",
    pitch:
      "Lost in a sunny meadow, your child learns that knowing the way home can look a lot like trusting themselves.",
    mood: { bg: "#e7d8a8", fg: "#4a5a2a" },
  },
  {
    slug: "04-wish-already-had",
    title: "The Wish I Already Had",
    theme: "The best magic is the one already around you.",
    pitch:
      "Offered one magical wish, your child reaches for castles and crowns — and learns that what they already have was the wish all along.",
    mood: { bg: "#4a2a4a", fg: "#f0d28a" },
  },
];

export type Pronouns = "she-her" | "he-him" | "they-them";

export const PRONOUN_OPTIONS: { value: Pronouns; label: string; sub: string; obj: string }[] = [
  { value: "she-her", label: "She / Her", sub: "she", obj: "her" },
  { value: "he-him",  label: "He / Him",  sub: "he",  obj: "him" },
  { value: "they-them", label: "They / Them", sub: "they", obj: "them" },
];

export type BookOrderDraft = {
  heroName: string;
  pronouns: Pronouns;
  storySlug: string;
  companionSlug: string;
  photoDataUrl?: string; // base64 data URL, only in browser memory until submit
};
