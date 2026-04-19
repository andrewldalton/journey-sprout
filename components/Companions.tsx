import Image from "next/image";
import { Blob, Sparkle, Sprout } from "./decorations";
import { COMPANIONS } from "@/lib/catalog";

const cardShadow =
  "0 24px 40px -24px rgba(45, 27, 15, 0.3), 0 8px 16px -6px rgba(45, 27, 15, 0.15)";

export function Companions() {
  return (
    <section id="companions" className="relative overflow-hidden py-24 md:py-32">
      <Blob
        variant="b"
        color="#C9672A"
        className="watercolor-blob absolute top-[-4rem] right-[-8rem] w-[420px] h-[420px]"
        style={{ opacity: 0.12 }}
      />
      <Blob
        variant="a"
        color="#7FA075"
        className="watercolor-blob absolute bottom-[-8rem] left-[-6rem] w-[400px] h-[400px]"
        style={{ opacity: 0.18 }}
      />
      <Sparkle
        color="#CA8A04"
        className="absolute top-[18%] right-[14%] w-4 opacity-75 float-soft"
      />
      <Sprout
        color="#7FA075"
        className="absolute bottom-[10%] left-[10%] w-7 opacity-60 float-soft-slower"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow fade-rise" data-delay="1">
            <span className="dot-rule mr-3"><span /><span /><span /></span>
            Meet the eight friends
          </p>
          <h2
            className="font-display font-bold text-4xl md:text-5xl leading-[1.04] text-ink mt-5 fade-rise"
            data-delay="2"
          >
            Every kid picks{" "}
            <span className="text-terracotta handline">a partner in crime.</span>
          </h2>
          <p
            className="font-body text-lg text-ink-soft mt-6 leading-relaxed fade-rise"
            data-delay="3"
          >
            Eight watercolor animal companions, each with their own temperament. Whichever one you choose, our AI illustrator paints them right next to your kid on every page.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-10">
          {COMPANIONS.map((c, i) => (
            <article
              key={c.slug}
              className="fade-rise text-center"
              data-delay={(4 + i).toString()}
            >
              <figure
                className="relative aspect-square rounded-full overflow-hidden mx-auto w-36 h-36 md:w-40 md:h-40"
                style={{
                  boxShadow: cardShadow,
                  background: `${c.accent}1a`,
                  border: `2px solid ${c.accent}55`,
                }}
              >
                <Image
                  src={c.imageSrc}
                  alt={`${c.name} the ${c.species}`}
                  width={320}
                  height={320}
                  className="w-full h-full object-cover"
                />
              </figure>
              <h3 className="font-display font-bold text-xl text-ink mt-4">
                {c.name}
              </h3>
              <p
                className="font-body text-[11px] uppercase tracking-widest mt-1"
                style={{ color: c.accent, letterSpacing: "0.14em" }}
              >
                the {c.species}
              </p>
              <p className="font-body text-sm text-ink-soft mt-3 leading-relaxed max-w-[18ch] mx-auto">
                {c.blurb}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
