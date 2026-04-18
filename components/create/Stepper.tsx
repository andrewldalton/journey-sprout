/**
 * Horizontal stepper — shows the 5 builder stages and highlights the current
 * one. Non-interactive visual aid only; step navigation is handled by the
 * wizard itself (Continue / Back buttons).
 */
type StepperProps = {
  current: number;       // 1-indexed
  labels: string[];      // length === total steps
};

export function Stepper({ current, labels }: StepperProps) {
  return (
    <nav aria-label="Book builder progress" className="w-full mt-10 mb-2">
      <ol className="mx-auto max-w-3xl px-6 flex items-center gap-2">
        {labels.map((label, idx) => {
          const n = idx + 1;
          const state =
            n < current ? "done" : n === current ? "current" : "upcoming";
          return (
            <li key={label} className="flex-1 flex items-center gap-2">
              <div
                aria-current={state === "current" ? "step" : undefined}
                className="flex-1 flex flex-col items-center gap-2"
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
                <span
                  className="font-body font-semibold text-[11px] tracking-[0.2em] uppercase text-center"
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
    </nav>
  );
}
