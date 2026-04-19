/**
 * Horizontal stepper — shows the 5 builder stages and highlights the current
 * one. Non-interactive visual aid only; step navigation is handled by the
 * wizard itself (Continue / Back buttons).
 *
 * On narrow screens (<640px) the label row collapses to just the active
 * step's label plus a "Step N of M" counter, because 5 eight-character
 * labels don't fit across a 375px-wide phone without truncating.
 */
type StepperProps = {
  current: number;       // 1-indexed
  labels: string[];      // length === total steps
};

export function Stepper({ current, labels }: StepperProps) {
  const total = labels.length;
  const safeCurrent = Math.max(1, Math.min(current, total));
  const currentLabel = labels[safeCurrent - 1];

  return (
    <nav aria-label="Book builder progress" className="w-full mt-8 md:mt-10 mb-2">
      <ol className="mx-auto max-w-3xl px-6 flex items-center gap-1.5 sm:gap-2">
        {labels.map((label, idx) => {
          const n = idx + 1;
          const state =
            n < safeCurrent ? "done" : n === safeCurrent ? "current" : "upcoming";
          return (
            <li key={label} className="flex-1 flex items-center gap-2 min-w-0">
              <div
                aria-current={state === "current" ? "step" : undefined}
                className="flex-1 flex flex-col items-center gap-2 min-w-0"
              >
                <div
                  className="h-1.5 w-full rounded-full"
                  style={{
                    background:
                      state === "upcoming"
                        ? "rgba(175, 140, 80, 0.22)"
                        : state === "current"
                          ? "var(--color-terracotta)"
                          : "var(--color-sage)",
                  }}
                />
                {/* Labels — hidden on phones, revealed at sm+ */}
                <span
                  className="hidden sm:block font-body font-semibold text-[11px] tracking-[0.2em] uppercase text-center truncate w-full"
                  style={{
                    color:
                      state === "current"
                        ? "var(--color-terracotta)"
                        : state === "done"
                          ? "var(--color-sage-deep)"
                          : "var(--color-ink-muted)",
                  }}
                >
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Mobile-only: single label with step counter. */}
      <p
        className="sm:hidden mt-3 px-6 font-body font-semibold text-[11px] tracking-[0.2em] uppercase text-center"
        style={{ color: "var(--color-terracotta)" }}
      >
        <span className="text-ink-muted mr-2">
          Step {safeCurrent} of {total}
        </span>
        {currentLabel}
      </p>
    </nav>
  );
}
