"use client";

import { useState } from "react";
import { Stepper } from "@/components/create/Stepper";
import { StepUpload } from "@/components/create/StepUpload";
import { StepHero } from "@/components/create/StepHero";
import { StepStory } from "@/components/create/StepStory";
import { StepCompanion } from "@/components/create/StepCompanion";
import { StepReview } from "@/components/create/StepReview";
import { StepDone } from "@/components/create/StepDone";
import type { Pronouns } from "@/lib/catalog";

const STEP_LABELS = ["Photo", "Name", "Story", "Friend", "Review"];

type Phase = 1 | 2 | 3 | 4 | 5 | "done";

type Draft = {
  photoDataUrl?: string;
  heroName?: string;
  pronouns?: Pronouns;
  storySlug?: string;
  companionSlug?: string;
  email?: string;
};

export default function CreatePage() {
  const [phase, setPhase] = useState<Phase>(1);
  const [draft, setDraft] = useState<Draft>({});
  const [orderId, setOrderId] = useState<string | null>(null);

  function goBack() {
    setPhase((p) => {
      if (p === "done") return 5;
      if (p === 1) return 1;
      return (p - 1) as Phase;
    });
  }

  async function submit(
    email: string
  ): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroName: draft.heroName,
          pronouns: draft.pronouns,
          storySlug: draft.storySlug,
          companionSlug: draft.companionSlug,
          email,
          photoDataUrl: draft.photoDataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: data?.error ?? "Something went sideways. Try again?",
        };
      }
      setDraft((d) => ({ ...d, email }));
      return { ok: true, orderId: data.orderId };
    } catch {
      return { ok: false, error: "Network hiccup. Try again in a moment." };
    }
  }

  return (
    <main className="flex-1 min-h-screen">
      {phase !== "done" && (
        <Stepper current={phase as number} labels={STEP_LABELS} />
      )}

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
        <StepHero
          initialName={draft.heroName}
          initialPronouns={draft.pronouns}
          onBack={goBack}
          onNext={(name, pronouns) => {
            setDraft((d) => ({ ...d, heroName: name, pronouns }));
            setPhase(3);
          }}
        />
      )}

      {phase === 3 && (
        <StepStory
          selectedSlug={draft.storySlug ?? null}
          onSelect={(slug) => setDraft((d) => ({ ...d, storySlug: slug }))}
          onBack={goBack}
          onNext={() => setPhase(4)}
        />
      )}

      {phase === 4 && (
        <StepCompanion
          selectedSlug={draft.companionSlug ?? null}
          onSelect={(slug) => setDraft((d) => ({ ...d, companionSlug: slug }))}
          onBack={goBack}
          onNext={() => setPhase(5)}
        />
      )}

      {phase === 5 &&
        draft.photoDataUrl &&
        draft.heroName &&
        draft.pronouns &&
        draft.storySlug &&
        draft.companionSlug && (
          <StepReview
            draft={{
              photoDataUrl: draft.photoDataUrl,
              heroName: draft.heroName,
              pronouns: draft.pronouns,
              storySlug: draft.storySlug,
              companionSlug: draft.companionSlug,
            }}
            initialEmail={draft.email}
            onBack={goBack}
            onSubmit={submit}
            onSuccess={(id) => {
              setOrderId(id);
              setPhase("done");
            }}
          />
        )}

      {phase === "done" && orderId && draft.email && draft.heroName && (
        <StepDone
          orderId={orderId}
          email={draft.email}
          heroName={draft.heroName}
        />
      )}
    </main>
  );
}
