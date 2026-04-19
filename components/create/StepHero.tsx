"use client";

import { useState } from "react";
import { Sprout, Sparkle } from "../decorations";
import { PRONOUN_OPTIONS, type Pronouns } from "@/lib/catalog";

type Props = {
  initialName?: string;
  initialPronouns?: Pronouns;
  initialEmail?: string;
  submitting?: boolean;
  onNext: (name: string, pronouns: Pronouns, email: string) => void;
  onBack: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepHero({
  initialName,
  initialPronouns,
  initialEmail,
  submitting,
  onNext,
  onBack,
}: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [pronouns, setPronouns] = useState<Pronouns>(initialPronouns ?? "she-her");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [touched, setTouched] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= 24;
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const isValid = nameValid && emailValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onNext(trimmedName, pronouns, trimmedEmail);
  }

  return (
    <section className="relative mx-auto max-w-2xl px-6 py-16 md:py-24">
      <div className="fade-rise" data-delay="1">
        <p className="eyebrow">
          <span className="dot-rule mr-3"><span /><span /><span /></span>
          Step 2 of 5
        </p>
      </div>

      <h1
        className="font-display font-bold text-4xl md:text-5xl leading-tight text-ink mt-5 fade-rise"
        data-delay="2"
      >
        <Sparkle color="#CA8A04" className="w-5 h-5 inline-block mr-2 -mt-1" />
        Who are we painting?
      </h1>

      <p
        className="font-body text-lg text-ink-soft mt-5 leading-relaxed fade-rise"
        data-delay="3"
      >
        We&rsquo;ll paint a watercolor portrait next — you&rsquo;ll approve it
        before we make the full book. Use whatever your little one answers to.
      </p>

      <form onSubmit={handleSubmit} className="mt-10">
        <div className="fade-rise" data-delay="3">
          <label
            htmlFor="hero-name"
            className="block font-display text-sm tracking-wide text-ink-soft mb-2"
          >
            Hero&rsquo;s name
          </label>
          <input
            id="hero-name"
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Beckett"
            required
            className="input-pill"
            autoFocus
          />
          {touched && !nameValid && (
            <p
              className="mt-2 text-sm text-terracotta font-body"
              role="alert"
              aria-live="polite"
            >
              A name between 1 and 24 characters, please.
            </p>
          )}
        </div>

        <fieldset className="mt-8 fade-rise" data-delay="4">
          <legend className="block font-display text-sm tracking-wide text-ink-soft mb-3">
            Pronouns (we&rsquo;ll use these throughout the book)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PRONOUN_OPTIONS.map((opt) => {
              const selected = pronouns === opt.value;
              return (
                <label
                  key={opt.value}
                  className="relative cursor-pointer rounded-[14px] border-[1.5px] px-4 py-3 transition-colors"
                  style={{
                    borderColor: selected
                      ? "var(--color-terracotta)"
                      : "var(--color-border-warm)",
                    background: selected ? "var(--color-paper)" : "var(--color-cream)",
                    boxShadow: selected
                      ? "0 0 0 3px rgba(201, 103, 42, 0.12)"
                      : "none",
                  }}
                >
                  <input
                    type="radio"
                    name="pronouns"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setPronouns(opt.value)}
                    className="sr-only"
                  />
                  <span className="font-display font-semibold text-ink">
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-8 fade-rise" data-delay="4">
          <label
            htmlFor="hero-email"
            className="block font-display text-sm tracking-wide text-ink-soft mb-2"
          >
            Your email
          </label>
          <input
            id="hero-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="input-pill"
          />
          <p className="mt-2 text-xs text-ink-muted font-body">
            We&rsquo;ll email you the portrait, then the finished book.
          </p>
          {touched && !emailValid && (
            <p
              className="mt-2 text-sm text-terracotta font-body"
              role="alert"
              aria-live="polite"
            >
              Please use a valid email so we can send the book.
            </p>
          )}
        </div>

        <div
          className="mt-10 flex items-center justify-between gap-4 fade-rise"
          data-delay="5"
        >
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost"
            disabled={submitting}
          >
            <svg
              viewBox="0 0 20 20"
              className="w-4 h-4"
              fill="none"
              aria-hidden="true"
            >
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
            type="submit"
            className="btn-primary"
            disabled={!isValid || submitting}
          >
            {submitting ? "Starting…" : "Paint the portrait"}
            {!submitting && (
              <svg
                viewBox="0 0 20 20"
                className="w-4 h-4"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </form>

      <p
        className="mt-10 flex items-center gap-3 text-sm text-ink-muted fade-rise"
        data-delay="5"
      >
        <Sprout color="#7FA075" className="w-5 h-5" />
        You&rsquo;ll see the painted version of your little one in about
        fifteen seconds. Approve it, pick a story, and we make the book.
      </p>
    </section>
  );
}
