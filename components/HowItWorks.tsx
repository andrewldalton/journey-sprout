import { Blob, LeafSpray, Sparkle, Sprout, SunDrawing } from "./decorations";

type Step = {
  numeral: string;
  title: string;
  body: string;
  accent: React.ReactNode;
  numeralColor: string;
};

const STEPS: Step[] = [
  {
    numeral: "01",
    title: "Send a photo, meet the painted version",
    body: "A clear head-and-shoulders shot is all we need. Our AI illustrator turns it into a warm watercolor portrait — and you approve it before we make anything else. If it doesn't look like your little one, we repaint.",
    accent: (
      <SunDrawing
        color="#CA8A04"
        className="w-10 h-10 opacity-80 float-soft-slower"
        style={{ ["--r" as string]: "-6deg" }}
      />
    ),
    numeralColor: "text-terracotta",
  },
  {
    numeral: "02",
    title: "Pick a tale + a friend",
    body: "Four hand-written stories. Eight painted animal companions. You choose the mix — the AI paints your kid into every page alongside their new friend.",
    accent: (
      <LeafSpray
        color="#7FA075"
        className="w-16 opacity-85 float-soft"
        style={{ ["--r" as string]: "4deg" }}
      />
    ),
    numeralColor: "text-gold",
  },
  {
    numeral: "03",
    title: "Watch them smile when they see it",
    body: "Your personalized PDF arrives in about ten minutes — ten watercolor pages plus a cover, made to make your baby giggle when they spot themselves. Print it, read it, keep it forever.",
    accent: (
      <Sprout
        color="#7FA075"
        className="w-10 h-10 opacity-85"
      />
    ),
    numeralColor: "text-terracotta",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden border-t border-border-soft bg-paper/60 py-24 md:py-32"
    >
      {/* Paper grain over the whole band */}
      <div className="paper-grain absolute inset-0" aria-hidden="true" />

      {/* Atmospheric painted accents */}
      <Blob
        variant="b"
        color="#E5B44A"
        className="watercolor-blob absolute -top-24 right-[-8%] w-[380px] h-[380px]"
        style={{ opacity: 0.22 }}
      />
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute bottom-[-14%] left-[-10%] w-[360px] h-[360px]"
        style={{ opacity: 0.2 }}
      />
      <Sparkle
        color="#C9672A"
        className="absolute top-12 left-[12%] w-4 opacity-70 float-soft"
      />
      <Sparkle
        color="#CA8A04"
        className="absolute bottom-16 right-[14%] w-3 opacity-70 float-soft-slower"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="max-w-2xl">
          <p className="eyebrow fade-rise" data-delay="1">
            <span className="dot-rule mr-3"><span /><span /><span /></span>
            How it works
          </p>
          <h2 className="font-display font-bold text-4xl md:text-5xl lg:text-[3.6rem] leading-[1.02] text-ink mt-5 fade-rise" data-delay="2">
            How the{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-terracotta handline">magic</span>
            </span>{" "}
            happens.
          </h2>
          <p className="font-body text-lg text-ink-soft mt-6 leading-relaxed max-w-xl fade-rise" data-delay="3">
            Three small steps. No studio visit, no six-week wait. Our AI
            illustrator paints your kid into a story they&rsquo;ll ask you to
            read again tomorrow.
          </p>
        </div>

        {/* Steps */}
        <ol className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-12">
          {STEPS.map((step, i) => (
            <li
              key={step.numeral}
              className="relative fade-rise"
              data-delay={i + 1}
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`font-display font-bold text-6xl md:text-7xl leading-none ${step.numeralColor}`}
                  aria-hidden="true"
                >
                  {step.numeral}
                </span>
                <div className="mt-2">{step.accent}</div>
              </div>

              <h3 className="font-display font-semibold text-2xl md:text-[1.6rem] text-ink mt-6">
                {step.title}
              </h3>
              <p className="font-body text-base md:text-[1.05rem] text-ink-soft mt-3 leading-relaxed max-w-sm">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
