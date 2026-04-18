"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent, type JSX } from "react";
import { COMPANIONS, STORIES, PRONOUN_OPTIONS } from "@/lib/catalog";
import { Sparkle, Sprout } from "../decorations";

type Props = {
  draft: {
    photoDataUrl: string;
    heroName: string;
    pronouns: "she-her" | "he-him" | "they-them";
    storySlug: string;
    companionSlug: string;
  };
  initialEmail?: string;
  onBack: () => void;
  onSubmit: (
    email: string
  ) => Promise<{ ok: boolean; orderId?: string; error?: string }>;
  onSuccess: (orderId: string) => void;
};

type Status = "idle" | "submitting" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepReview({
  draft,
  initialEmail = "",
  onBack,
  onSubmit,
  onSuccess,
}: Props): JSX.Element {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const story = STORIES.find((s) => s.slug === draft.storySlug);
  const companion = COMPANIONS.find((c) => c.slug === draft.companionSlug);
  const pronouns = PRONOUN_OPTIONS.find((p) => p.value === draft.pronouns);
  const accent = companion?.accent ?? "#c9672a";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setStatus("error");
      setErrorMessage("That email doesn't look quite right. Mind checking it?");
      emailRef.current?.focus();
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const result = await onSubmit(trimmed);
      if (result.ok && result.orderId) {
        onSuccess(result.orderId);
        return;
      }
      setStatus("error");
      setErrorMessage(
        result.error ||
          "Something went sideways on our end. Try again in a moment?"
      );
      emailRef.current?.focus();
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went sideways on our end. Try again in a moment?"
      );
      emailRef.current?.focus();
    }
  }

  const isSubmitting = status === "submitting";

  return (
    <section className="relative mx-auto max-w-5xl px-6 py-14 md:py-20">
      <header className="max-w-2xl">
        <p className="eyebrow fade-rise" data-delay="1">
          <span className="dot-rule mr-3">
            <span />
            <span />
            <span />
          </span>
          Step 5 of 5
        </p>

        <h2
          className="font-display font-bold text-4xl md:text-5xl leading-[1.02] text-ink mt-5 fade-rise"
          data-delay="2"
        >
          One more look.
        </h2>

        <p
          className="font-body text-lg text-ink-soft mt-5 max-w-xl leading-relaxed fade-rise"
          data-delay="3"
        >
          Here&rsquo;s what we&rsquo;ll paint. If anything looks off, step
          back and change it &mdash; nothing&rsquo;s sent yet.
        </p>
      </header>

      <div
        className="paper-grain relative isolate mt-10 rounded-[24px] bg-paper border border-warm p-6 md:p-8 fade-rise"
        data-delay="3"
        style={{
          boxShadow: "0 24px 48px -28px rgba(45,27,15,0.25)",
        }}
      >
        <div className="relative z-[1] grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 md:gap-10 items-start">
          <div className="relative">
            {/* Plain <img> — next/image doesn't accept arbitrary data URLs */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.photoDataUrl}
              alt={`Reference photo of ${draft.heroName}`}
              className="w-full aspect-square object-cover rounded-[20px] bg-paper-deep"
              style={{
                boxShadow:
                  "0 18px 40px -22px rgba(45,27,15,0.35), inset 0 0 0 1px rgba(217,201,167,0.6)",
              }}
            />
            <Sparkle
              color={accent}
              className="absolute -top-3 -right-3 w-6 h-6 float-soft"
            />
          </div>

          <dl className="space-y-6">
            <div>
              <dt className="eyebrow">Hero</dt>
              <dd className="mt-2">
                <span
                  className="font-display font-bold text-4xl md:text-5xl leading-tight block"
                  style={{ color: accent }}
                >
                  {draft.heroName}
                </span>
                {pronouns && (
                  <span className="mt-1 block text-sm text-ink-muted">
                    {pronouns.label}
                  </span>
                )}
              </dd>
            </div>

            <div className="border-t border-warm pt-5">
              <dt className="eyebrow">Story</dt>
              <dd className="mt-2">
                <span className="font-display font-semibold text-2xl text-ink block leading-tight">
                  {story?.title ?? "—"}
                </span>
                {story && (
                  <span className="mt-1 block font-body text-ink-soft italic">
                    {story.theme}
                  </span>
                )}
              </dd>
            </div>

            <div className="border-t border-warm pt-5">
              <dt className="eyebrow">Companion</dt>
              <dd className="mt-3 flex items-center gap-4">
                {companion && (
                  <div
                    className="relative flex-shrink-0 w-16 h-16 rounded-[14px] overflow-hidden bg-paper-deep"
                    style={{
                      boxShadow: "inset 0 0 0 1px rgba(217,201,167,0.6)",
                    }}
                  >
                    <Image
                      src={companion.imageSrc}
                      alt={`${companion.name}, a painted ${companion.species}`}
                      width={120}
                      height={120}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <span
                    className="font-display font-semibold text-2xl leading-tight block"
                    style={{ color: accent }}
                  >
                    {companion?.name ?? "—"}
                  </span>
                  {companion && (
                    <span className="mt-0.5 block font-body text-sm text-ink-soft leading-snug">
                      {companion.blurb}
                    </span>
                  )}
                </div>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-10 max-w-xl fade-rise"
        data-delay="4"
      >
        <label
          htmlFor="review-email"
          className="block font-display font-semibold text-lg text-ink"
        >
          Where should we send your book?
        </label>
        <input
          id="review-email"
          ref={emailRef}
          type="email"
          required
          autoComplete="email"
          placeholder="you@somewhere.warm"
          className="input-pill mt-3"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setErrorMessage("");
            }
          }}
          disabled={isSubmitting}
          aria-invalid={status === "error"}
          aria-describedby="review-email-help review-email-error"
        />
        <p
          id="review-email-help"
          className="mt-3 text-sm text-ink-muted font-body flex items-start gap-2"
        >
          <Sprout
            color="#7FA075"
            className="w-4 h-4 mt-0.5 flex-shrink-0"
          />
          <span>
            We&rsquo;ll email you the PDF when it&rsquo;s ready (usually within
            10 minutes). Photo auto-deletes 30 days after delivery.
          </span>
        </p>

        <div
          id="review-email-error"
          aria-live="polite"
          className="min-h-[1.5rem] mt-3 text-sm"
        >
          {status === "error" && (
            <p className="text-terracotta font-body">{errorMessage}</p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            className="btn-ghost"
            onClick={onBack}
            disabled={isSubmitting}
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
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
            style={
              isSubmitting
                ? { opacity: 0.7, cursor: "wait" }
                : undefined
            }
          >
            {isSubmitting ? "Making your book…" : "Make my book"}
            {!isSubmitting && (
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
    </section>
  );
}
