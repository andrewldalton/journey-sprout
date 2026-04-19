"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/create/Stepper";
import { StepUpload } from "@/components/create/StepUpload";
import { StepHero } from "@/components/create/StepHero";
import { StepApproveSheet } from "@/components/create/StepApproveSheet";
import { StepStory } from "@/components/create/StepStory";
import { StepCompanion } from "@/components/create/StepCompanion";
import { StepConfirm } from "@/components/create/StepConfirm";
import type { Pronouns } from "@/lib/catalog";

// Phases: 1 photo → 2 hero (name+pronouns+email) → 3 approve painted portrait
// → 4 story → 5 companion → 6 confirm → finalize → /book/[id]
const STEP_LABELS = ["Photo", "You", "Portrait", "Story", "Friend", "Confirm"];

type Phase = 1 | 2 | 3 | 4 | 5 | 6;

type Draft = {
  photoDataUrl?: string;
  heroName?: string;
  heroAge?: number;
  pronouns?: Pronouns;
  email?: string;
  orderId?: string;
  sheetUrl?: string;
  storySlug?: string;
  companionSlug?: string;
};

export default function CreatePage() {
  const [phase, setPhase] = useState<Phase>(1);
  const [draft, setDraft] = useState<Draft>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  const goBack = useCallback(() => {
    setSubmitError(null);
    setPhase((p) => (p === 1 ? 1 : ((p - 1) as Phase)));
  }, []);

  /** Called after StepHero — create the order and kick off sheet rendering. */
  const startOrder = useCallback(
    async (name: string, pronouns: Pronouns, email: string, age: number) => {
      if (!draft.photoDataUrl) {
        setSubmitError("We lost your photo — try the previous step again.");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            heroName: name,
            heroAge: age,
            pronouns,
            photoDataUrl: draft.photoDataUrl,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.orderId) {
          setSubmitError(body.error ?? "Something went sideways. Try again?");
          return;
        }
        setDraft((d) => ({
          ...d,
          heroName: name,
          heroAge: age,
          pronouns,
          email,
          orderId: body.orderId,
        }));
        setPhase(3);
      } catch {
        setSubmitError("Network hiccup. Try again in a moment.");
      } finally {
        setSubmitting(false);
      }
    },
    [draft.photoDataUrl]
  );

  /** Called after StepCompanion — finalize story + companion and fire render. */
  const finalizeBook = useCallback(
    async (storySlug: string, companionSlug: string) => {
      if (!draft.orderId) {
        setSubmitError("We lost your order — go back and try again.");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch(`/api/orders/${draft.orderId}/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storySlug, companionSlug }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError(body.error ?? "Something went sideways. Try again?");
          return;
        }
        router.push(`/book/${draft.orderId}`);
      } catch {
        setSubmitError("Network hiccup. Try again in a moment.");
      } finally {
        setSubmitting(false);
      }
    },
    [draft.orderId, router]
  );

  return (
    <main className="flex-1 min-h-screen">
      <Stepper current={phase} labels={STEP_LABELS} />

      {phase === 1 && (
        <StepUpload
          initialDataUrl={draft.photoDataUrl}
          onNext={(photoDataUrl) => {
            setDraft((d) => ({ ...d, photoDataUrl }));
            setPhase(2);
          }}
        />
      )}

      {phase === 2 && (
        <>
          <StepHero
            initialName={draft.heroName}
            initialPronouns={draft.pronouns}
            initialEmail={draft.email}
            initialAge={draft.heroAge}
            submitting={submitting}
            onBack={goBack}
            onNext={startOrder}
          />
          {submitError && (
            <p className="mx-auto max-w-2xl px-6 -mt-6 text-terracotta font-body text-sm text-center">
              {submitError}
            </p>
          )}
        </>
      )}

      {phase === 3 && draft.orderId && draft.heroName && (
        <StepApproveSheet
          orderId={draft.orderId}
          heroName={draft.heroName}
          onApproved={(sheetUrl) => {
            setDraft((d) => ({ ...d, sheetUrl }));
            setPhase(4);
          }}
          onBack={goBack}
        />
      )}

      {phase === 4 && (
        <StepStory
          selectedSlug={draft.storySlug ?? null}
          onSelect={(slug) => setDraft((d) => ({ ...d, storySlug: slug }))}
          onBack={goBack}
          onNext={() => setPhase(5)}
        />
      )}

      {phase === 5 && draft.storySlug && (
        <StepCompanion
          selectedSlug={draft.companionSlug ?? null}
          onSelect={(slug) => setDraft((d) => ({ ...d, companionSlug: slug }))}
          onBack={goBack}
          onNext={() => {
            if (draft.storySlug && draft.companionSlug) setPhase(6);
          }}
        />
      )}

      {phase === 6 &&
        draft.heroName &&
        draft.heroAge !== undefined &&
        draft.email &&
        draft.storySlug &&
        draft.companionSlug && (
        <>
          <StepConfirm
            heroName={draft.heroName}
            heroAge={draft.heroAge}
            email={draft.email}
            storySlug={draft.storySlug}
            companionSlug={draft.companionSlug}
            sheetUrl={draft.sheetUrl ?? null}
            submitting={submitting}
            onEdit={(p) => setPhase(p)}
            onConfirm={() => {
              if (draft.storySlug && draft.companionSlug) {
                finalizeBook(draft.storySlug, draft.companionSlug);
              }
            }}
            onBack={goBack}
          />
          {submitError && (
            <p className="mx-auto max-w-2xl px-6 -mt-6 text-terracotta font-body text-sm text-center">
              {submitError}
            </p>
          )}
        </>
      )}
    </main>
  );
}
