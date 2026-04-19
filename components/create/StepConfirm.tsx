"use client";

import Image from "next/image";
import { Sparkle, Sprout } from "../decorations";
import { COMPANIONS, STORIES } from "@/lib/catalog";

type Props = {
  heroName: string;
  heroAge: number;
  email: string;
  storySlug: string;
  companionSlug: string;
  sheetUrl: string | null;
  submitting?: boolean;
  onEdit: (phase: 1 | 2 | 3 | 4 | 5) => void;
  onConfirm: () => void;
  onBack: () => void;
};

export function StepConfirm({
  heroName,
  heroAge,
  email,
  storySlug,
  companionSlug,
  sheetUrl,
  submitting,
  onEdit,
  onConfirm,
  onBack,
}: Props) {
  const story = STORIES.find((s) => s.slug === storySlug);
  const companion = COMPANIONS.find((c) => c.slug === companionSlug);

  return (
    <section className="relative mx-auto max-w-2xl px-6 py-16 md:py-24">
      <div className="fade-rise" data-delay="1">
        <p className="eyebrow">
          <span className="dot-rule mr-3"><span /><span /><span /></span>
          Ready to paint
        </p>
      </div>

      <h1
        className="font-display font-bold text-4xl md:text-5xl leading-tight text-ink mt-5 fade-rise"
        data-delay="2"
      >
        <Sparkle color="#CA8A04" className="w-5 h-5 inline-block mr-2 -mt-1" />
        Does this all look right?
      </h1>

      <p
        className="font-body text-lg text-ink-soft mt-5 leading-relaxed fade-rise"
        data-delay="3"
      >
        One last check before our AI illustrator paints ten pages plus a
        cover. You can change anything here.
      </p>

      <div className="mt-10 space-y-4 fade-rise" data-delay="3">
        <ConfirmRow
          label="Hero"
          value={`${heroName} (${heroAge === 0 ? "under 1" : `${heroAge} yr${heroAge === 1 ? "" : "s"} old`})`}
          onEdit={() => onEdit(2)}
          thumbnail={
            sheetUrl ? (
              <Image
                src={sheetUrl}
                alt={`${heroName} painted`}
                width={64}
                height={84}
                className="object-cover rounded-lg"
                unoptimized
              />
            ) : null
          }
        />
        <ConfirmRow
          label="Story"
          value={story?.title ?? storySlug}
          sub={story?.pitch}
          onEdit={() => onEdit(4)}
        />
        <ConfirmRow
          label="Companion"
          value={companion ? `${companion.name} the ${companion.species}` : companionSlug}
          sub={companion?.blurb}
          onEdit={() => onEdit(5)}
          thumbnail={
            companion ? (
              <Image
                src={companion.imageSrc}
                alt={companion.name}
                width={64}
                height={64}
                className="object-cover rounded-full"
                style={{ background: `${companion.accent}1a`, border: `2px solid ${companion.accent}55` }}
              />
            ) : null
          }
        />
        <ConfirmRow label="Email" value={email} onEdit={() => onEdit(2)} />
      </div>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 fade-rise" data-delay="5">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="btn-ghost w-full sm:w-auto"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
            <path d="M16 10 L 4 10 M 9 5 L 4 10 L 9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="btn-primary w-full sm:w-auto"
        >
          {submitting ? "Starting the book…" : "Yes, make the book"}
          {!submitting && (
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
              <path d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <p className="mt-10 flex items-center gap-3 text-sm text-ink-muted fade-rise" data-delay="6">
        <Sprout color="#7FA075" className="w-5 h-5" />
        Our AI illustrator will paint ten watercolor pages plus a cover in about three minutes.
      </p>
    </section>
  );
}

function ConfirmRow({
  label,
  value,
  sub,
  onEdit,
  thumbnail,
}: {
  label: string;
  value: string;
  sub?: string;
  onEdit: () => void;
  thumbnail?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-4 rounded-[16px] border-[1.5px] px-5 py-4"
      style={{ borderColor: "var(--color-border-warm)", background: "var(--color-paper)" }}
    >
      {thumbnail && <div className="flex-shrink-0">{thumbnail}</div>}
      <div className="flex-1 min-w-0">
        <p className="font-display text-xs tracking-wide text-ink-muted uppercase">
          {label}
        </p>
        <p className="font-display font-semibold text-ink mt-1 truncate">{value}</p>
        {sub && (
          <p className="font-body text-sm text-ink-soft mt-1 leading-snug line-clamp-2">
            {sub}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex-shrink-0 font-display text-sm text-terracotta hover:underline"
      >
        Change
      </button>
    </div>
  );
}
