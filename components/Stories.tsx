import Image from "next/image";
import { Blob, LeafSpray, Sparkle } from "./decorations";
import { STORIES } from "@/lib/catalog";

const cardShadow =
  "0 30px 50px -28px rgba(45, 27, 15, 0.35), 0 10px 20px -8px rgba(45, 27, 15, 0.18)";

export function Stories() {
  return (
    <section id="stories" className="relative overflow-hidden py-24 md:py-32">
      <Blob
        variant="c"
        color="#7FA075"
        className="watercolor-blob absolute top-[-4rem] left-[-6rem] w-[360px] h-[360px]"
        style={{ opacity: 0.14 }}
      />
      <Blob
        variant="a"
        color="#CA8A04"
        className="watercolor-blob absolute bottom-[-6rem] right-[-6rem] w-[420px] h-[420px]"
        style={{ opacity: 0.16 }}
      />
      <LeafSpray
        color="#7FA075"
        className="absolute top-10 right-[7%] w-24 opacity-55 hidden md:block float-soft-slower"
        style={{ ["--r" as string]: "6deg", transform: "rotate(6deg)" }}
      />
      <Sparkle
        color="#C9672A"
        className="absolute top-[20%] left-[12%] w-4 opacity-75 float-soft"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow fade-rise" data-delay="1">
            <span className="dot-rule mr-3"><span /><span /><span /></span>
            Four ways to adventure
          </p>
          <h2
            className="font-display font-bold text-4xl md:text-5xl leading-[1.04] text-ink mt-5 fade-rise"
            data-delay="2"
          >
            Pick a world.{" "}
            <span className="text-terracotta handline">We'll meet you there.</span>
          </h2>
          <p
            className="font-body text-lg text-ink-soft mt-6 leading-relaxed fade-rise"
            data-delay="3"
          >
            Every journeysprout book is written by hand and painted in watercolor — starring your child and a companion of your choice. Four stories, each with its own quirky friends to meet along the way.
          </p>
        </div>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {STORIES.map((story, i) => (
            <article
              key={story.slug}
              className="fade-rise group"
              data-delay={(4 + i).toString()}
            >
              <figure
                className="relative aspect-square rounded-[20px] overflow-hidden"
                style={{
                  boxShadow: cardShadow,
                  background: story.mood.bg,
                }}
              >
                {story.coverSrc ? (
                  <Image
                    src={story.coverSrc}
                    alt={`Cover of ${story.title}`}
                    width={600}
                    height={600}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center font-display text-3xl"
                    style={{ color: story.mood.fg }}
                  >
                    {story.title}
                  </div>
                )}
              </figure>
              <h3 className="font-display font-bold text-2xl text-ink mt-5 leading-tight">
                {story.title}
              </h3>
              <p className="font-body text-sm text-ink-soft mt-2 leading-relaxed">
                {story.pitch}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-14 text-center fade-rise" data-delay="8">
          <a
            href="/create"
            className="inline-flex items-center gap-2 rounded-full bg-terracotta px-8 py-4 font-display font-semibold text-cream text-base shadow-lg shadow-terracotta/30 hover:bg-terracotta/90 transition-colors"
          >
            Start a book →
          </a>
        </div>
      </div>
    </section>
  );
}
