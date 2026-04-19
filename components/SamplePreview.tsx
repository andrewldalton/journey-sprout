import Image from "next/image";
import { Blob, LeafSpray, Sparkle, Sprout } from "./decorations";

const paperShadow =
  "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)";
const coverShadow =
  "0 50px 70px -30px rgba(45, 27, 15, 0.4), 0 14px 26px -10px rgba(45, 27, 15, 0.25)";

export function SamplePreview() {
  return (
    <section
      id="sample"
      className="relative overflow-hidden py-24 md:py-32"
    >
      {/* Atmospheric painted blobs */}
      <Blob
        variant="b"
        color="#CA8A04"
        className="watercolor-blob absolute -top-24 right-[-6rem] w-[240px] h-[240px] sm:w-[340px] sm:h-[340px] md:w-[420px] md:h-[420px]"
        style={{ opacity: 0.18 }}
      />
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute bottom-[-6rem] -left-24 w-[240px] h-[240px] sm:w-[320px] sm:h-[320px] md:w-[380px] md:h-[380px]"
        style={{ opacity: 0.22 }}
      />

      <LeafSpray
        color="#7FA075"
        className="absolute top-14 left-[8%] w-28 opacity-60 hidden md:block float-soft-slower"
        style={{ ["--r" as string]: "-6deg", transform: "scaleX(-1) rotate(-6deg)" }}
      />
      <Sparkle
        color="#CA8A04"
        className="absolute top-[22%] right-[9%] w-4 opacity-75 float-soft"
      />

      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-[1fr_1.1fr] gap-14 lg:gap-20 items-center">
        {/* COPY */}
        <div className="relative z-10">
          <p className="eyebrow fade-rise" data-delay="1">
            <span className="dot-rule mr-3"><span /><span /><span /></span>
            A sample journey
          </p>

          <h2 className="font-display font-bold text-[2.25rem] sm:text-4xl md:text-5xl lg:text-[3.6rem] leading-[1.04] md:leading-[1.02] text-ink mt-5 fade-rise" data-delay="2">
            One book.{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-terracotta handline">Made for one kid.</span>
            </span>
          </h2>

          <p className="font-body text-lg text-ink-soft mt-7 max-w-lg leading-relaxed fade-rise" data-delay="3">
            Every journeysprout book is written by hand, then painted in
            watercolor by our AI illustrator — starring your child. No
            templates, no name-swap. The little one on the page looks like
            yours, because they&rsquo;re painted from your photo.
          </p>

          <p className="font-body text-base text-ink-soft mt-5 max-w-lg leading-relaxed fade-rise" data-delay="3">
            That&rsquo;s the whole point: a real picture book that makes your
            baby light up when they see themselves in it.
          </p>

          <p className="font-body text-sm text-ink-muted mt-8 max-w-md leading-relaxed flex items-start gap-3 fade-rise" data-delay="4">
            <Sprout color="#7FA075" className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>
              This one was painted for a little girl named{" "}
              <span className="text-ink-soft font-semibold">Beckett</span>.
              Yours will be painted just for your little one.
            </span>
          </p>
        </div>

        {/* BOOK FAN */}
        <div className="relative h-[320px] sm:h-[440px] md:h-[540px] lg:h-[600px] fade-rise" data-delay="3">
          {/* Page 1 — back left, deepest tilt */}
          <figure
            className="absolute left-[2%] top-[14%] w-[48%] aspect-square rounded-[22px] overflow-hidden float-soft-slower"
            style={{
              transform: "rotate(-9deg)",
              boxShadow: paperShadow,
              ["--r" as string]: "-9deg",
              zIndex: 1,
            }}
          >
            <Image
              src="/samples/moonbound-bubble.png"
              alt="Sample page from Moonbound — Beckett and Sprig float weightless inside shimmering bubble helmets in the warm cosmos"
              width={1024}
              height={1024}
              className="w-full h-full object-cover"
            />
          </figure>

          {/* Page 10 — back right, tilted out */}
          <figure
            className="absolute right-[2%] top-[10%] w-[48%] aspect-square rounded-[22px] overflow-hidden float-soft"
            style={{
              transform: "rotate(8deg)",
              boxShadow: paperShadow,
              ["--r" as string]: "8deg",
              zIndex: 2,
            }}
          >
            <Image
              src="/samples/moonbound-stars.png"
              alt="Sample page from Moonbound — Beckett arms wide in full-hearted cosmic awe"
              width={1024}
              height={1024}
              className="w-full h-full object-cover"
            />
          </figure>

          {/* Cover — front and centered */}
          <figure
            className="absolute left-1/2 -translate-x-1/2 bottom-[2%] w-[62%] aspect-square rounded-[22px] overflow-hidden float-soft"
            style={{
              transform: "translateX(-50%) rotate(-1.5deg)",
              boxShadow: coverShadow,
              ["--r" as string]: "-1.5deg",
              zIndex: 3,
            }}
          >
            <Image
              src="/samples/moonbound-cover.png"
              alt="Sample journeysprout cover titled Moonbound"
              width={1024}
              height={1024}
              className="w-full h-full object-cover"
            />
          </figure>

          <Sparkle
            color="#C9672A"
            className="absolute bottom-[18%] right-[10%] w-3 opacity-70 float-soft-slower"
            style={{ zIndex: 4 }}
          />
        </div>
      </div>
    </section>
  );
}
