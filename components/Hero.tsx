import Image from "next/image";
import { Blob, LeafSpray, Sparkle, Sprout } from "./decorations";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-28 md:pt-24 md:pb-36">
      {/* Atmospheric painted blobs */}
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute -top-20 -left-24 w-[420px] h-[420px]"
      />
      <Blob
        variant="c"
        color="#CA8A04"
        className="watercolor-blob absolute top-40 -right-32 w-[460px] h-[460px]"
        style={{ opacity: 0.22 }}
      />

      {/* Decorative sprouts + sparkles */}
      <LeafSpray
        color="#7FA075"
        className="absolute top-10 right-[7%] w-32 opacity-70 hidden md:block float-soft-slower"
        style={{ ["--r" as string]: "4deg" }}
      />
      <Sprout
        color="#7FA075"
        className="absolute bottom-12 left-[6%] w-16 opacity-80 hidden md:block"
      />
      <Sparkle
        color="#CA8A04"
        className="absolute top-[28%] left-[52%] w-5 opacity-80 float-soft"
      />
      <Sparkle
        color="#C9672A"
        className="absolute top-[62%] right-[20%] w-3 opacity-70 float-soft-slower"
      />

      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-20 items-center">
        {/* COPY */}
        <div className="relative z-10">
          <p className="eyebrow fade-rise" data-delay="1">
            <span className="dot-rule mr-3"><span /><span /><span /></span>
            A journeysprout story
          </p>

          <h1 className="font-display font-bold text-5xl md:text-[4.5rem] lg:text-[5rem] leading-[0.98] text-ink mt-5 fade-rise" data-delay="2">
            Your child,
            <br />
            in their own{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-terracotta handline">storybook.</span>
            </span>
          </h1>

          <p className="font-body text-lg md:text-xl text-ink-soft mt-7 max-w-xl leading-relaxed fade-rise" data-delay="3">
            Upload a photo. Pick a tale. We&rsquo;ll hand-paint a watercolor picture
            book where your little one is the hero — a keepsake that looks
            exactly like them, delivered in minutes.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4 fade-rise" data-delay="4">
            <a href="/create" className="btn-primary">
              Make a book
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
                <path d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#sample" className="btn-ghost">
              See a sample
            </a>
            <a href="#waitlist" className="font-body text-sm text-ink-muted prose-link">
              or join the waitlist
            </a>
          </div>

          <p className="mt-8 text-sm text-ink-muted fade-rise flex items-center gap-3" data-delay="5">
            <Sprout color="#7FA075" className="w-5 h-5" />
            Opening soon. No spam — we&rsquo;ll write once when it&rsquo;s ready.
          </p>
        </div>

        {/* BOOK STACK */}
        <div className="relative h-[440px] md:h-[560px] lg:h-[620px] fade-rise" data-delay="3">
          {/* Page 1 (deepest, rotated left) */}
          <figure
            className="absolute left-[6%] top-[8%] w-[58%] aspect-[1/1] rounded-[22px] overflow-hidden float-soft-slower"
            style={{
              transform: "rotate(-7deg)",
              boxShadow:
                "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
              ["--r" as string]: "-7deg",
            }}
          >
            <Image
              src="/samples/moonbound-bubble.png"
              alt="A sample interior page from a journeysprout book — Beckett and Sprig drifting in bubble helmets through the warm cosmos"
              width={800}
              height={800}
              className="w-full h-full object-cover"
              priority
            />
          </figure>

          {/* Page 10 (middle, rotated right) */}
          <figure
            className="absolute right-[3%] top-[22%] w-[56%] aspect-[1/1] rounded-[22px] overflow-hidden float-soft"
            style={{
              transform: "rotate(5deg)",
              boxShadow:
                "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
              ["--r" as string]: "5deg",
            }}
          >
            <Image
              src="/samples/moonbound-stars.png"
              alt="A sample ending page from a journeysprout book — Beckett arms wide in full-hearted cosmic awe"
              width={800}
              height={800}
              className="w-full h-full object-cover"
              priority
            />
          </figure>

          {/* Cover (front, slight left tilt) */}
          <figure
            className="absolute left-[18%] bottom-[0%] w-[64%] aspect-[1/1] rounded-[22px] overflow-hidden float-soft"
            style={{
              transform: "rotate(-2deg)",
              boxShadow:
                "0 50px 70px -30px rgba(45, 27, 15, 0.4), 0 14px 26px -10px rgba(45, 27, 15, 0.25)",
              ["--r" as string]: "-2deg",
              zIndex: 3,
            }}
          >
            <Image
              src="/samples/moonbound-cover.png"
              alt="Sample journeysprout cover titled Moonbound"
              width={800}
              height={800}
              className="w-full h-full object-cover"
              priority
            />
          </figure>
        </div>
      </div>
    </section>
  );
}
