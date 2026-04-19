/**
 * Shared catalog of stories and companions available in journeysprout.
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
    slug: "01-night-stars",
    title: "Moonbound",
    theme: "Adventure is fun, and the universe is full of wonder.",
    pitch:
      "A tiny silver rocket, a jar of stardust, and a whole warm cosmos of new friends — a polite meteor, a glowing moon sheep, a joke-collecting robot, and a six-handed baby alien all waiting to say hi.",
    coverSrc: "/samples/01-night-stars-cover.png",
    mood: { bg: "#2a1f4a", fg: "#ffd98a" },
  },
  {
    slug: "02-long-way-home",
    title: "Down Where the Coral Dreams",
    theme: "Adventure is fun, and the deep is full of friends.",
    pitch:
      "A glowing pearl, a bubble shield, and a sunlit reef full of curious creatures — a smiling sea turtle, a striped little fish, a shy octopus, all drifting together through a whole new underwater world.",
    coverSrc: "/samples/02-long-way-home-cover.png",
    mood: { bg: "#b5e1df", fg: "#1f4f6b" },
  },
  {
    slug: "03-seed-took-time",
    title: "Our Big Zoo Day",
    theme: "Adventure is fun, and friendship is everywhere.",
    pitch:
      "A whole bright day at the zoo — a glitter-sneezing giraffe, a ballerina flamingo, a slow-motion sloth, and a shimmer-striped zebra to meet along the way.",
    coverSrc: "/samples/03-seed-took-time-cover.png",
    mood: { bg: "#ffd98a", fg: "#c14a3b" },
  },
  {
    slug: "04-wish-already-had",
    title: "The Jungle Whispers Hi",
    theme: "Adventure is fun, and the jungle is alive with hellos.",
    pitch:
      "Under a mossy arch and into a hidden clearing — a humming frog, a castanet toucan, a glitter-trail butterfly, and a slow-smiling sloth waiting around a sparkly pool.",
    coverSrc: "/samples/04-wish-already-had-cover.png",
    mood: { bg: "#a8d49c", fg: "#2a4a1f" },
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
