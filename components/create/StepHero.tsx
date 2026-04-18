"use client";

import { useState } from "react";
import { Sprout, Sparkle } from "../decorations";
import { PRONOUN_OPTIONS, type Pronouns } from "@/lib/catalog";

type Props = {
  initialName?: string;
  initialPronouns?: Pronouns;
  onNext: (name: string, pronouns: Pronouns) => void;
  onBack: () => void;
};

export function StepHero({ initialName, initialPronouns, onNext, onBack }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [pronouns, setPronouns] = useState<Pronouns>(initialPronouns ?? "she-her");
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 24;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onNext(trimmed, pronouns);
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
        What&rsquo;s your hero&rsquo;s name?
      </h1>

      <p
        className="font-body text-lg text-ink-soft mt-5 leading-relaxed fade-rise"
        data-delay="3"
      >
        This name will show up across every page of the book. Use whatever your
        little one answers to — nickname is perfect.
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
          {touched && !isValid && (
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

        <div
          className="mt-10 flex items-center justify-between gap-4 fade-rise"
          data-delay="5"
        >
          <button type="button" onClick={onBack} className="btn-ghost">
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
          <button type="submit" className="btn-primary" disabled={!isValid}>
            Continue
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
          </button>
        </div>
      </form>

      <p
        className="mt-10 flex items-center gap-3 text-sm text-ink-muted fade-rise"
        data-delay="5"
      >
        <Sprout color="#7FA075" className="w-5 h-5" />
        You can change any of this before you check out.
      </p>
    </section>
  );
}
