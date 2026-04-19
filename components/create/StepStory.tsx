"use client";

import Image from "next/image";
import { STORIES, type Story } from "@/lib/catalog";
import { LeafSpray, Sparkle, Sprout } from "../decorations";

type Props = {
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepStory({ selectedSlug, onSelect, onNext, onBack }: Props) {
  return (
    <section className="relative mx-auto max-w-5xl px-6 py-16 md:py-24">
      <div className="fade-rise" data-delay="1">
        <p className="eyebrow">
          <span className="dot-rule mr-3"><span /><span /><span /></span>
          Step 3 of 5
        </p>
        <h2 className="font-display font-bold text-4xl md:text-5xl text-ink mt-4 leading-[1.02]">
          Pick a tale.
        </h2>
        <p className="font-body text-lg text-ink-soft mt-4 max-w-xl leading-relaxed">
          Each is a hand-written 10-page watercolor picture book, ending with a feeling worth keeping.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mt-12">
        {STORIES.map((story, i) => (
          <StoryCard
            key={story.slug}
            story={story}
            selected={selectedSlug === story.slug}
            delay={(i + 1) as 1 | 2 | 3 | 4}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="mt-14 flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} className="btn-ghost">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
            <path d="M16 10 L 4 10 M 9 5 L 4 10 L 9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedSlug}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-terracotta)]"
        >
          Continue
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
            <path d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

function StoryCard({
  story,
  selected,
  delay,
  onSelect,
}: {
  story: Story;
  selected: boolean;
  delay: 1 | 2 | 3 | 4;
  onSelect: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(story.slug)}
      className={[
        "group relative text-left overflow-hidden rounded-[24px] bg-cream fade-rise",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-gold-soft/60",
        selected
          ? "border-[2.5px] border-terracotta shadow-[0_18px_44px_-18px_rgba(201,103,42,0.55),0_0_0_6px_rgba(201,103,42,0.12)]"
          : "border border-warm shadow-[0_6px_18px_-10px_rgba(45,27,15,0.25)] hover:shadow-[0_20px_40px_-20px_rgba(45,27,15,0.35)] hover:-translate-y-0.5 hover:border-ink-muted/40",
      ].join(" ")}
      data-delay={delay}
    >
      {/* Cover / painted placeholder */}
      <div className="relative w-full aspect-[4/3] overflow-hidden">
        {story.coverSrc ? (
          <Image
            src={story.coverSrc}
            alt={`Sample cover for ${story.title}`}
            width={800}
            height={600}
            className="w-full h-full object-cover"
          />
        ) : (
          <PaintedPlaceholder story={story} />
        )}
      </div>

      {/* Body */}
      <div className="relative px-6 py-5 bg-paper/40 paper-grain">
        <h3 className="relative z-10 font-display font-semibold text-2xl text-ink leading-tight">
          {story.title}
        </h3>
        <p className="relative z-10 mt-1.5 font-body italic text-sm text-sage-deep tracking-wide">
          {story.theme}
        </p>
        <p className="relative z-10 mt-3 font-body text-[0.95rem] text-ink-soft leading-relaxed">
          {story.pitch}
        </p>
      </div>

      {/* Selected check */}
      {selected && (
        <span className="absolute top-3 right-3 z-20 inline-flex items-center justify-center w-8 h-8 rounded-full bg-cream shadow-md">
          <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="var(--color-terracotta)" />
            <path d="M7.5 12.3 L 10.8 15.4 L 16.5 9.3" stroke="var(--color-cream)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </span>
      )}
    </button>
  );
}

function PaintedPlaceholder({ story }: { story: Story }) {
  const { bg, fg } = story.mood;
  return (
    <div
      className="relative w-full h-full flex items-center justify-center px-6"
      style={{
        background: `radial-gradient(ellipse at 30% 25%, ${hexWithAlpha(fg, 0.18)}, transparent 55%), radial-gradient(ellipse at 75% 85%, ${hexWithAlpha(fg, 0.14)}, transparent 60%), ${bg}`,
      }}
    >
      <LeafSpray
        color={fg}
        className="absolute -top-2 -left-3 w-24 opacity-30 rotate-[-8deg]"
      />
      <Sparkle color={fg} className="absolute top-4 right-5 w-4 opacity-70" />
      <Sparkle color={fg} className="absolute bottom-8 left-6 w-3 opacity-50" />
      <Sprout color={fg} className="absolute -bottom-2 -right-2 w-14 opacity-35" />

      <div className="relative text-center">
        <span
          className="block font-display italic font-semibold text-3xl md:text-[2.15rem] leading-[1.05] tracking-tight"
          style={{ color: fg }}
        >
          {story.title}
        </span>
        <span
          className="mt-3 inline-flex items-center gap-2 font-body text-[0.7rem] tracking-[0.22em] uppercase opacity-75"
          style={{ color: fg }}
        >
          <span className="inline-block w-1 h-1 rounded-full" style={{ background: fg }} />
          A journeysprout tale
          <span className="inline-block w-1 h-1 rounded-full" style={{ background: fg }} />
        </span>
      </div>

      <span
        className="absolute bottom-2 right-3 font-body italic text-[0.68rem] opacity-60"
        style={{ color: fg }}
      >
        cover coming soon
      </span>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
