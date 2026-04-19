"use client";

import Image from "next/image";
import type { JSX } from "react";
import { COMPANIONS, type Companion } from "@/lib/catalog";
import { Sparkle } from "../decorations";

type Props = {
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepCompanion({
  selectedSlug,
  onSelect,
  onNext,
  onBack,
}: Props): JSX.Element {
  const canContinue = selectedSlug !== null;

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-14 md:py-20">
      <header className="max-w-2xl">
        <p className="eyebrow fade-rise" data-delay="1">
          <span className="dot-rule mr-3">
            <span />
            <span />
            <span />
          </span>
          Step 4 of 5
        </p>

        <h2
          className="font-display font-bold text-4xl md:text-5xl leading-[1.02] text-ink mt-5 fade-rise"
          data-delay="2"
        >
          Pick a friend.
        </h2>

        <p
          className="font-body text-lg text-ink-soft mt-5 max-w-xl leading-relaxed fade-rise"
          data-delay="3"
        >
          Every journeysprout story stars your child and one small painted
          friend. Their color threads through the book&rsquo;s title and
          typography.
        </p>
      </header>

      <ul
        role="radiogroup"
        aria-label="Choose a companion"
        className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
      >
        {COMPANIONS.map((companion, idx) => {
          const delay = Math.min(idx + 1, 5);
          return (
            <li key={companion.slug} className="fade-rise" data-delay={delay}>
              <CompanionCard
                companion={companion}
                selected={selectedSlug === companion.slug}
                onSelect={onSelect}
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm text-ink-muted text-center fade-rise" data-delay="5">
        Any companion can be paired with any story.
      </p>

      <div className="mt-12 flex items-center justify-between gap-4">
        <button type="button" className="btn-ghost" onClick={onBack}>
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
            <path
              d="M16 10 L 4 10 M 9 5 L 4 10 L 9 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={onNext}
          disabled={!canContinue}
          aria-disabled={!canContinue}
          style={
            !canContinue
              ? { opacity: 0.45, cursor: "not-allowed", boxShadow: "none" }
              : undefined
          }
        >
          Continue
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
            <path
              d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </section>
  );
}

function CompanionCard({
  companion,
  selected,
  onSelect,
}: {
  companion: Companion;
  selected: boolean;
  onSelect: (slug: string) => void;
}): JSX.Element {
  const { slug, name, species, accent, blurb, imageSrc } = companion;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-pressed={selected}
      aria-label={`Choose ${name}, the ${species}`}
      onClick={() => onSelect(slug)}
      className="paper-grain relative isolate w-full text-left rounded-[20px] bg-paper border border-warm p-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(45,27,15,0.35)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold-soft"
      style={
        selected
          ? {
              borderColor: accent,
              borderWidth: "2.5px",
              boxShadow: `0 0 0 4px ${accent}22, 0 18px 40px -22px rgba(45,27,15,0.35)`,
            }
          : undefined
      }
    >
      {selected && (
        <Sparkle
          color={accent}
          className="absolute top-2 left-2 w-4 h-4 fade-rise"
          data-delay="1"
        />
      )}

      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-6 h-6 rounded-full text-cream shadow-[0_4px_10px_-3px_rgba(45,27,15,0.4)]"
          style={{ backgroundColor: accent }}
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" aria-hidden="true">
            <path
              d="M4 10.5 L 8.5 15 L 16 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      <div
        className="relative z-[1] aspect-square w-full overflow-hidden rounded-[16px] bg-paper-deep"
        style={{
          boxShadow: "inset 0 0 0 1px rgba(217, 201, 167, 0.6)",
        }}
      >
        <Image
          src={imageSrc}
          alt={`${name}, a painted ${species} companion`}
          width={220}
          height={220}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="relative z-[1] mt-4 px-1">
        <h3
          className="font-display font-semibold text-2xl leading-tight"
          style={{ color: accent }}
        >
          {name}
        </h3>
        <p className="mt-1 text-[0.65rem] font-bold tracking-[0.22em] uppercase text-ink-muted">
          {species}
        </p>
        <p className="mt-2 font-body text-sm text-ink-soft leading-snug line-clamp-2">
          {blurb}
        </p>
      </div>
    </button>
  );
}
