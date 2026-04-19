"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sprout, Sparkle } from "../decorations";

type OrderSnapshot = {
  id: string;
  status: string;
  sheetUrl: string | null;
  sheetStatus: "pending" | "pending_review" | "approved" | "regenerating";
  regenCount: number;
  regensLeft: number;
  maxRegens: number;
  error: string | null;
};

const POLL_MS = 3000;

type Props = {
  orderId: string;
  heroName: string;
  onApproved: (sheetUrl: string) => void;
  onBack: () => void;
};

export function StepApproveSheet({ orderId, heroName, onApproved, onBack }: Props) {
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [action, setAction] = useState<null | "approve" | "regenerate">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/book/${orderId}`, { cache: "no-store" });
      if (!res.ok) {
        setFetchError("Lost the connection — retrying.");
        return true;
      }
      const data = (await res.json()) as OrderSnapshot;
      setSnapshot(data);
      setFetchError(null);
      // Keep polling while we're waiting for a sheet to finish rendering.
      // Stop when the sheet is pending_review (waiting on the customer) or
      // approved (about to leave this screen).
      return (
        data.sheetStatus !== "pending_review" && data.sheetStatus !== "approved"
      );
    } catch {
      setFetchError("Network hiccup — retrying.");
      return true;
    }
  }, [orderId]);

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

  // Auto-advance after approval flips the DB flag.
  useEffect(() => {
    if (
      snapshot?.sheetStatus === "approved" &&
      snapshot.sheetUrl &&
      !advancedRef.current
    ) {
      advancedRef.current = true;
      onApproved(snapshot.sheetUrl);
    }
  }, [snapshot?.sheetStatus, snapshot?.sheetUrl, onApproved]);

  const approve = useCallback(async () => {
    setAction("approve");
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/sheet/approve`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error ?? "Couldn't approve — try again.");
      } else {
        await fetchStatus();
      }
    } catch {
      setActionError("Network hiccup — try again.");
    } finally {
      setAction(null);
    }
  }, [orderId, fetchStatus]);

  const regenerate = useCallback(async () => {
    setAction("regenerate");
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/sheet/regenerate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error ?? "Couldn't regenerate — try again.");
      } else {
        await fetchStatus();
      }
    } catch {
      setActionError("Network hiccup — try again.");
    } finally {
      setAction(null);
    }
  }, [orderId, fetchStatus]);

  const inReview =
    snapshot?.sheetStatus === "pending_review" && !!snapshot.sheetUrl;
  const regenerating = snapshot?.sheetStatus === "regenerating";
  const painting =
    !snapshot ||
    (snapshot.sheetStatus === "pending" && !snapshot.sheetUrl);

  return (
    <section className="relative mx-auto max-w-2xl px-6 py-16 md:py-24 text-center">
      <div className="fade-rise" data-delay="1">
        <p className="eyebrow">
          <span className="dot-rule mr-3"><span /><span /><span /></span>
          Step 3 of 5
        </p>
      </div>

      <h1
        className="font-display font-bold text-[2.25rem] sm:text-4xl md:text-5xl leading-tight text-ink mt-5 fade-rise break-words"
        data-delay="2"
      >
        <Sparkle color="#CA8A04" className="w-5 h-5 inline-block mr-2 -mt-1" />
        {inReview
          ? `Here's ${heroName}.`
          : regenerating
            ? `Repainting ${heroName}…`
            : `Painting ${heroName}…`}
      </h1>

      <p
        className="font-body text-lg text-ink-soft mt-5 leading-relaxed fade-rise"
        data-delay="3"
      >
        {inReview
          ? `Our AI illustrator painted ${heroName} from your photo. If this looks like your little one, we'll paint the whole book. If not, we'll try again.`
          : regenerating
            ? `Our AI is mixing a new batch of paint. About fifteen seconds.`
            : `Our AI illustrator is painting ${heroName} from your photo in warm watercolor. About fifteen seconds.`}
      </p>

      <div className="mt-10 flex justify-center fade-rise" data-delay="4">
        {inReview && snapshot?.sheetUrl ? (
          <div
            className="relative w-[240px] sm:w-[280px] aspect-[3/4] rounded-[20px] overflow-hidden bg-paper-deep"
            style={{
              boxShadow:
                "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
            }}
          >
            <Image
              src={snapshot.sheetUrl}
              alt={`${heroName} painted in watercolor`}
              fill
              className="object-cover"
              sizes="(max-width: 639px) 240px, 280px"
              priority
              unoptimized
            />
          </div>
        ) : (
          <div
            className="w-[240px] sm:w-[280px] aspect-[3/4] rounded-[20px] bg-paper-deep flex items-center justify-center"
            style={{
              boxShadow:
                "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
            }}
          >
            <p className="font-body text-ink-muted text-sm animate-pulse">
              {painting ? "Painting…" : "Almost there…"}
            </p>
          </div>
        )}
      </div>

      {inReview && (
        <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 fade-rise" data-delay="5">
          <button
            type="button"
            onClick={approve}
            disabled={action !== null}
            className="btn-primary w-full sm:w-auto"
          >
            {action === "approve" ? "One sec…" : "Yes, that's them"}
          </button>
          <button
            type="button"
            onClick={regenerate}
            disabled={action !== null || (snapshot?.regensLeft ?? 0) <= 0}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-12 rounded-full border-2 border-ink/15 px-6 py-3 font-display font-semibold text-ink text-base hover:border-terracotta/60 hover:text-terracotta disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {action === "regenerate"
              ? "Repainting…"
              : (snapshot?.regensLeft ?? 0) > 0
                ? `Try again (${snapshot?.regensLeft} left)`
                : "No regenerations left"}
          </button>
        </div>
      )}

      {actionError && (
        <p className="mt-4 text-terracotta font-body text-sm">{actionError}</p>
      )}

      {fetchError && !snapshot && (
        <p className="mt-4 text-ink-muted font-body text-sm">{fetchError}</p>
      )}

      <div
        className="mt-12 flex items-center justify-center gap-3 fade-rise"
        data-delay="6"
      >
        <button
          type="button"
          onClick={onBack}
          disabled={action !== null || !inReview}
          className="btn-ghost"
        >
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
      </div>

      <p
        className="mt-8 flex items-center justify-center gap-3 text-sm text-ink-muted fade-rise"
        data-delay="6"
      >
        <Sprout color="#7FA075" className="w-5 h-5" />
        This AI-painted portrait is the one we&rsquo;ll use across every page
        of the book — {heroName} in lots of different scenes and poses.
      </p>
    </section>
  );
}
