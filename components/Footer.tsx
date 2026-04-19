import { Sprout } from "./decorations";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border-soft py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-6 flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          <Sprout color="#7FA075" className="w-6 h-6 opacity-85" />
          <span className="font-display font-medium text-2xl md:text-[1.75rem] text-ink-soft tracking-tight">
            journeysprout
          </span>
        </div>

        <p className="font-body text-base md:text-lg text-ink-muted mt-5 max-w-md leading-relaxed">
          AI-illustrated watercolor books for tiny humans. Made with care, in Omaha.
        </p>

        <nav
          aria-label="Footer"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-sm text-ink-muted"
        >
          <a
            href="/privacy"
            className="hover:text-ink-soft underline decoration-border-warm decoration-[1.5px] underline-offset-4 hover:decoration-terracotta focus-visible:outline-3 focus-visible:outline-gold-soft focus-visible:outline-offset-2 transition-colors"
          >
            Privacy
          </a>
          <span className="dot-rule" aria-hidden="true"><span /></span>
          <a
            href="/terms"
            className="hover:text-ink-soft underline decoration-border-warm decoration-[1.5px] underline-offset-4 hover:decoration-terracotta focus-visible:outline-3 focus-visible:outline-gold-soft focus-visible:outline-offset-2 transition-colors"
          >
            Terms
          </a>
          <span className="dot-rule" aria-hidden="true"><span /></span>
          <a
            href="mailto:hello@journeysprout.com"
            className="hover:text-ink-soft underline decoration-border-warm decoration-[1.5px] underline-offset-4 hover:decoration-terracotta focus-visible:outline-3 focus-visible:outline-gold-soft focus-visible:outline-offset-2 transition-colors"
          >
            hello@journeysprout.com
          </a>
        </nav>

        <p className="mt-6 text-xs text-ink-muted/80 font-body tracking-wide">
          &copy; {year} journeysprout
        </p>
      </div>
    </footer>
  );
}
