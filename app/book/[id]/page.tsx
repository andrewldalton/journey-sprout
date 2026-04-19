"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { Blob, LeafSpray, Sparkle, Sprout } from "@/components/decorations";
import { COMPANIONS, STORIES } from "@/lib/catalog";

const POLL_MS = 3_000;

type Status =
  | "pending"
  | "generating_sheet"
  | "awaiting_sheet_review"
  | "rendering_pages"
  | "finalizing"
  | "ready"
  | "failed"
  | "emailed";

type SheetStatus = "pending" | "pending_review" | "approved" | "regenerating";

type OrderSnapshot = {
  id: string;
  status: Status;
  heroName: string;
  storySlug: string;
  companionSlug: string;
  pagesDone: number;
  pagesTotal: number;
  pdfUrl: string | null;
  sheetUrl: string | null;
  sheetStatus: SheetStatus;
  regenCount: number;
  maxRegens: number;
  regensLeft: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_COPY: Record<Status, { title: string; sub: string }> = {
  pending: {
    title: "Just got your order.",
    sub: "Spinning up the paint.",
  },
  generating_sheet: {
    title: "Painting the hero.",
    sub: "Our AI illustrator is turning your photo into a watercolor character.",
  },
  awaiting_sheet_review: {
    title: "Here's your little one.",
    sub: "Our AI painted them from your photo. If this looks like them, we'll make the book.",
  },
  rendering_pages: {
    title: "Painting the pages.",
    sub: "Our AI illustrator is painting ten watercolor scenes, one at a time.",
  },
  finalizing: {
    title: "Binding the book.",
    sub: "Stitching the pages into a PDF.",
  },
  ready: {
    title: "Your book is ready.",
    sub: "The PDF is just finishing up.",
  },
  emailed: {
    title: "The book is in your inbox.",
    sub: "",
  },
  failed: {
    title: "Something got tangled.",
    sub: "We'll take a look. In the meantime you can try again.",
  },
};

export default function BookStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<null | "approve" | "regenerate">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/book/${id}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("We couldn't find that book.");
        return false;
      }
      if (!res.ok) {
        setError("Something's off — give it a second.");
        return true;
      }
      const data = (await res.json()) as OrderSnapshot;
      setOrder(data);
      setError(null);
      // Stop polling only when a terminal state is reached. pending_review
      // keeps polling so if the customer leaves the tab open during a
      // background re-render it'll pick up the new sheet.
      return data.status !== "emailed" && data.status !== "failed";
    } catch {
      setError("Network hiccup. Retrying…");
      return true;
    }
  }, [id]);

  useEffect(() => {
    let stopped = false;
    async function loop() {
      if (stopped) return;
      const keepPolling = await fetchStatus();
      if (keepPolling && !stopped) {
        timerRef.current = setTimeout(loop, POLL_MS);
      }
    }
    loop();
    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchStatus]);

  const approve = useCallback(async () => {
    setActionPending("approve");
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${id}/sheet/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error ?? "Couldn't approve — try again.");
      } else {
        fetchStatus();
      }
    } catch {
      setActionError("Network hiccup — try again.");
    } finally {
      setActionPending(null);
    }
  }, [id, fetchStatus]);

  const regenerate = useCallback(async () => {
    setActionPending("regenerate");
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${id}/sheet/regenerate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error ?? "Couldn't regenerate — try again.");
      } else {
        fetchStatus();
      }
    } catch {
      setActionError("Network hiccup — try again.");
    } finally {
      setActionPending(null);
    }
  }, [id, fetchStatus]);

  if (error && !order) {
    return (
      <section className="relative mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="eyebrow">Missing book</p>
        <h1 className="font-display font-bold text-3xl md:text-5xl mt-4 text-ink">
          {error}
        </h1>
        <p className="mt-6 text-ink-soft">
          <Link href="/" className="prose-link">Back to journeysprout</Link>
        </p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="relative mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-ink-soft">Loading your book…</p>
      </section>
    );
  }

  const copy = STATUS_COPY[order.status];
  const story = STORIES.find((s) => s.slug === order.storySlug);
  const companion = COMPANIONS.find((c) => c.slug === order.companionSlug);

  const inReview = order.sheetStatus === "pending_review" && !!order.sheetUrl;
  const regenerating = order.sheetStatus === "regenerating";

  // Progress bar shown once the book is actually being rendered (post-approval).
  const showProgress =
    order.sheetStatus === "approved" &&
    order.status !== "emailed" &&
    order.status !== "failed";

  const pct =
    order.pagesTotal > 0
      ? Math.min(100, Math.round((order.pagesDone / order.pagesTotal) * 100))
      : 0;

  return (
    <section className="relative overflow-hidden min-h-[80vh] flex items-center justify-center px-6 py-16 sm:py-24 md:py-32">
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute -top-24 -left-24 w-[240px] h-[240px] sm:w-[340px] sm:h-[340px] md:w-[440px] md:h-[440px]"
      />
      <Blob
        variant="c"
        color="#CA8A04"
        className="watercolor-blob absolute -bottom-20 -right-24 w-[260px] h-[260px] sm:w-[360px] sm:h-[360px] md:w-[460px] md:h-[460px]"
        style={{ opacity: 0.26 }}
      />
      <LeafSpray
        color="#7FA075"
        className="absolute top-20 right-[8%] w-28 opacity-65 hidden md:block float-soft-slower"
        style={{ ["--r" as string]: "6deg" }}
      />
      <Sparkle
        color={companion?.accent ?? "#CA8A04"}
        className="absolute top-[32%] left-[18%] w-5 opacity-80 float-soft"
      />

      <div className="relative z-10 mx-auto max-w-2xl w-full text-center">
        <p className="eyebrow fade-rise" data-delay="1">
          <span className="dot-rule mr-3">
            <span />
            <span />
            <span />
          </span>
          {order.status === "emailed"
            ? "Delivered"
            : inReview
              ? "A first look"
              : regenerating
                ? "Repainting"
                : "In the oven"}
        </p>

        <h1
          className="font-display font-bold text-4xl md:text-5xl leading-[1.04] text-ink mt-5 fade-rise"
          data-delay="2"
        >
          {copy.title}
        </h1>

        {copy.sub && (
          <p
            className="font-body text-lg text-ink-soft mt-6 leading-relaxed fade-rise"
            data-delay="3"
          >
            {copy.sub}
          </p>
        )}

        {story && companion && (
          <p
            className="font-body text-base text-ink-muted mt-4 fade-rise"
            data-delay="3"
          >
            <em style={{ color: companion.accent }}>{story.title}</em>,
            starring <strong>{order.heroName}</strong> and {companion.name}.
          </p>
        )}

        {/* Sheet review — customer approves or regenerates */}
        {inReview && order.sheetUrl && (
          <div className="mt-10 fade-rise" data-delay="4">
            <div
              className="relative mx-auto w-[240px] sm:w-[280px] aspect-[3/4] rounded-[20px] overflow-hidden bg-paper-deep"
              style={{
                boxShadow:
                  "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
              }}
            >
              <Image
                src={order.sheetUrl}
                alt={`${order.heroName} painted in watercolor`}
                fill
                className="object-cover"
                sizes="(max-width: 639px) 240px, 280px"
                priority
              />
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={approve}
                disabled={actionPending !== null}
                className="btn-primary w-full sm:w-auto"
              >
                {actionPending === "approve" ? "Starting the book…" : "Yes, make the book"}
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={actionPending !== null || order.regensLeft <= 0}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-12 rounded-full border-2 border-ink/15 px-6 py-3 font-display font-semibold text-ink text-base hover:border-terracotta/60 hover:text-terracotta disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {actionPending === "regenerate"
                  ? "Repainting…"
                  : order.regensLeft > 0
                    ? `Try again (${order.regensLeft} left)`
                    : "No regenerations left"}
              </button>
            </div>

            {actionError && (
              <p className="mt-4 text-rose font-body text-sm">{actionError}</p>
            )}

            <p className="mt-6 text-xs text-ink-muted font-body max-w-md mx-auto">
              Once you approve, our AI illustrator paints the full ten-page
              book — roughly three minutes. Every page will feature this
              watercolor version of {order.heroName}, across lots of different
              scenes and poses.
            </p>
          </div>
        )}

        {/* Regenerating — sheet re-rendering after customer clicked Try again */}
        {regenerating && (
          <div className="mt-10 fade-rise" data-delay="4">
            <div className="mx-auto w-[240px] sm:w-[280px] aspect-[3/4] rounded-[20px] bg-paper-deep flex items-center justify-center">
              <p className="font-body text-ink-muted text-sm animate-pulse">
                Painting a new version…
              </p>
            </div>
            <p className="mt-6 text-xs text-ink-muted font-body">
              This usually takes about fifteen seconds.
            </p>
          </div>
        )}

        {/* Progress bar (post-approval book render) */}
        {showProgress && (
          <div className="mt-10 fade-rise" data-delay="4">
            <div className="h-2 w-full rounded-full bg-paper-deep overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: "var(--color-terracotta)",
                }}
              />
            </div>
            <p className="mt-3 text-sm text-ink-muted font-body">
              {order.pagesDone} of {order.pagesTotal} painted
            </p>
          </div>
        )}

        {/* Delivered */}
        {order.status === "emailed" && order.pdfUrl && (
          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 fade-rise"
            data-delay="4"
          >
            <a
              href={order.pdfUrl}
              className="btn-primary w-full sm:w-auto"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download your book
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
                <path d="M10 3 V 13 M 5 9 L 10 14 L 15 9 M 4 17 L 16 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="font-body text-sm text-ink-muted text-center">
              Check your inbox — we just emailed it too.
            </p>
          </div>
        )}

        {order.status === "failed" && (
          <div className="mt-10 fade-rise" data-delay="4">
            <p className="text-rose font-body">
              {order.error ?? "The paint jar tipped over. We'll investigate."}
            </p>
            <Link href="/create" className="btn-primary mt-6 inline-flex">
              Try again
            </Link>
          </div>
        )}

        <div
          className="mt-16 flex items-center justify-center gap-3 fade-rise"
          data-delay="5"
        >
          <Sprout color="#7FA075" className="w-6 h-6 float-soft" />
          <Link href="/" className="font-body text-sm text-ink-muted prose-link">
            Back to journeysprout
          </Link>
        </div>

        <p className="mt-10 text-xs text-ink-muted font-body">
          Order reference:{" "}
          <span className="font-mono tracking-wide">{order.id}</span>
        </p>
      </div>
    </section>
  );
}
