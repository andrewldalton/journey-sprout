"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Blob, LeafSpray, Sparkle, Sprout } from "../decorations";

type Props = {
  orderId: string;
  email: string;
  heroName: string;
};

const SHARE_URL = "https://journeysprout.com";
const SHARE_TEXT =
  "I just made an AI-illustrated watercolor storybook starring my kid. You have to see their face.";

export function StepDone({ orderId, email, heroName }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  // Initialize share capability from navigator without a setState-in-effect.
  const [canShare] = useState(() =>
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleShare() {
    try {
      if (canShare) {
        await navigator.share({
          title: "journeysprout",
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
        return;
      }
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // User cancelled share sheet, or clipboard blocked — stay quiet.
    }
  }

  return (
    <section
      role="status"
      aria-live="polite"
      className="relative overflow-hidden min-h-[80vh] flex items-center justify-center px-6 py-24 md:py-32"
    >
      {/* Atmospheric painted blobs */}
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute -top-24 -left-24 w-[440px] h-[440px]"
      />
      <Blob
        variant="c"
        color="#CA8A04"
        className="watercolor-blob absolute -bottom-20 -right-24 w-[460px] h-[460px]"
        style={{ opacity: 0.28 }}
      />

      {/* Floating sprouts + sparkles */}
      <Sprout
        color="#7FA075"
        className="absolute top-16 left-[8%] w-12 opacity-75 float-soft hidden md:block"
      />
      <LeafSpray
        color="#7FA075"
        className="absolute top-24 right-[10%] w-28 opacity-70 float-soft-slower hidden md:block"
        style={{ ["--r" as string]: "6deg" }}
      />
      <Sparkle
        color="#CA8A04"
        className="absolute top-[30%] right-[22%] w-5 opacity-85 float-soft"
      />
      <Sparkle
        color="#C9672A"
        className="absolute bottom-[28%] left-[18%] w-4 opacity-75 float-soft-slower"
      />
      <Sparkle
        color="#7FA075"
        className="absolute bottom-[20%] right-[14%] w-3 opacity-70 float-soft"
      />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <p className="eyebrow fade-rise" data-delay="1">
          <span className="dot-rule mr-3">
            <span />
            <span />
            <span />
          </span>
          The paint is wet
        </p>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display font-bold text-4xl md:text-6xl leading-[1.02] text-ink mt-5 fade-rise focus:outline-none"
          data-delay="2"
        >
          Your book is in the oven,{" "}
          <span className="relative inline-block">
            <span className="relative z-10 text-terracotta handline">
              {heroName}.
            </span>
          </span>
        </h1>

        <p
          className="font-body text-lg md:text-xl text-ink-soft mt-7 leading-relaxed fade-rise"
          data-delay="3"
        >
          Our AI illustrator is painting the pages now. When it&rsquo;s done
          &mdash; usually within ten minutes &mdash; we&rsquo;ll send the PDF
          to <span className="font-semibold text-ink">{email}</span>. Get
          ready for a big smile.
        </p>

        <p
          className="font-body text-base text-ink-muted mt-4 fade-rise"
          data-delay="4"
        >
          You can close this tab. The book will arrive on its own.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 fade-rise"
          data-delay="4"
        >
          <button
            type="button"
            className="btn-primary"
            onClick={handleShare}
          >
            Tell a friend
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
          <span
            aria-live="polite"
            className="min-h-[1.25rem] text-sm text-sage-deep font-body"
          >
            {copied && !canShare ? "Link copied!" : ""}
          </span>
        </div>

        <div
          className="mt-16 flex items-center justify-center gap-3 fade-rise"
          data-delay="5"
        >
          <Sprout color="#7FA075" className="w-6 h-6 float-soft" />
          <Link
            href="/"
            className="font-body text-sm text-ink-muted prose-link"
          >
            Back to journeysprout.com
          </Link>
        </div>

        <p
          className="mt-10 text-xs text-ink-muted font-body fade-rise"
          data-delay="5"
        >
          Order reference:{" "}
          <span className="font-mono tracking-wide">{orderId}</span>
        </p>
      </div>
    </section>
  );
}
