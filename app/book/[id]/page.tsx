"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Blob, LeafSpray, Sparkle, Sprout } from "@/components/decorations";
import { COMPANIONS, STORIES } from "@/lib/catalog";

const POLL_MS = 3_000;

type Status =
  | "pending"
  | "generating_sheet"
  | "rendering_pages"
  | "finalizing"
  | "ready"
  | "failed"
  | "emailed";

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
    sub: "Turning your photo into a watercolor character.",
  },
  rendering_pages: {
    title: "Painting the pages.",
    sub: "Hand-painting ten illustrations, one at a time.",
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

  const pct =
    order.pagesTotal > 0
      ? Math.min(100, Math.round((order.pagesDone / order.pagesTotal) * 100))
      : 0;

  return (
    <section className="relative overflow-hidden min-h-[80vh] flex items-center justify-center px-6 py-24 md:py-32">
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute -top-24 -left-24 w-[440px] h-[440px]"
      />
      <Blob
        variant="c"
        color="#CA8A04"
        className="watercolor-blob absolute -bottom-20 -right-24 w-[460px] h-[460px]"
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
          {order.status === "emailed" ? "Delivered" : "In the oven"}
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

        {/* Progress bar */}
        {order.status !== "emailed" && order.status !== "failed" && (
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

        {/* Emailed state: show download + close-tab */}
        {order.status === "emailed" && order.pdfUrl && (
          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 fade-rise"
            data-delay="4"
          >
            <a
              href={order.pdfUrl}
              className="btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download your book
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
                <path d="M10 3 V 13 M 5 9 L 10 14 L 15 9 M 4 17 L 16 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="font-body text-sm text-ink-muted">
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
