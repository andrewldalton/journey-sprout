"use client";

import { useState, type FormEvent } from "react";
import { Sparkle, Sprout } from "./decorations";

type Status = "idle" | "submitting" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setStatus("error");
      setErrorMessage("That email doesn't look quite right. Mind checking it?");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data && typeof data.error === "string" && data.error) ||
            "Something went sideways on our end. Try again in a moment?"
        );
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went sideways on our end. Try again in a moment?"
      );
    }
  }

  const isSubmitting = status === "submitting";
  const isSuccess = status === "success";

  return (
    <section
      id="waitlist"
      className="relative overflow-hidden py-28 md:py-36 paper-grain"
    >
      <Sparkle
        color="#CA8A04"
        className="absolute top-16 left-[14%] w-4 opacity-70 float-soft hidden md:block"
      />
      <Sparkle
        color="#C9672A"
        className="absolute bottom-24 right-[16%] w-3 opacity-60 float-soft-slower hidden md:block"
      />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <p className="eyebrow fade-rise" data-delay="1">
          <span className="dot-rule mr-3"><span /><span /><span /></span>
          Reserve a spot
        </p>

        <h2 className="font-display font-bold text-4xl md:text-5xl lg:text-[3.5rem] leading-[1.02] text-ink mt-5 fade-rise" data-delay="2">
          Save your spot{" "}
          <span className="relative inline-block">
            <span className="relative z-10 text-terracotta handline">in the queue.</span>
          </span>
        </h2>

        {!isSuccess ? (
          <>
            <p className="font-body text-lg text-ink-soft mt-7 leading-relaxed fade-rise" data-delay="3">
              We&apos;re opening journeysprout to a small group first. Leave
              your email and we&apos;ll write to you the day we open — no
              newsletter, no noise, just the one letter.
            </p>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-10 fade-rise"
              data-delay="4"
            >
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <label htmlFor="waitlist-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@somewhere.warm"
                  className="input-pill sm:flex-1"
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
                  aria-describedby="waitlist-status"
                />
                <button
                  type="submit"
                  className="btn-primary justify-center whitespace-nowrap"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending…" : "Join the waitlist"}
                  {!isSubmitting && (
                    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
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

              <div
                id="waitlist-status"
                aria-live="polite"
                className="min-h-[1.5rem] mt-3 text-sm"
              >
                {status === "error" && (
                  <p className="text-terracotta font-body">{errorMessage}</p>
                )}
              </div>
            </form>

            <p className="mt-6 text-sm text-ink-muted font-body fade-rise flex items-center justify-center gap-2" data-delay="5">
              <Sprout color="#7FA075" className="w-4 h-4" />
              One letter. No spam, ever.
            </p>
          </>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="mt-10 fade-rise"
            data-delay="1"
          >
            <div className="inline-flex items-center justify-center gap-3">
              <Sparkle color="#CA8A04" className="w-6 h-6 float-soft" />
              <h3 className="font-display font-bold text-3xl md:text-4xl text-ink">
                You&apos;re in.
              </h3>
              <Sparkle color="#C9672A" className="w-5 h-5 float-soft-slower" />
            </div>
            <p className="font-body text-lg text-ink-soft mt-5 leading-relaxed">
              We&apos;ll write you one letter the day journeysprout opens.
              Promise — no spam, no noise.
            </p>
            <div className="mt-8 flex justify-center">
              <Sprout color="#7FA075" className="w-10 h-10 float-soft" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
