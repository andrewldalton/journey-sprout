# Journey Sprout

Personalized watercolor children's book product. Parents upload a photo, pick a story + companion, and receive a custom PDF picture book starring their child.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture at a glance

- **App router** (`app/`) with Server Components by default. Client-only components declare `"use client"`.
- **Tailwind v4** — theme tokens live in `app/globals.css` under `@theme { ... }`, not a config file.
- **Typography** — `Fredoka` (display) + `Nunito` (body) via `next/font/google`.
- **Palette** — `bg-cream`, `text-ink`, `text-sage`, `text-gold`, `text-terracotta`, `border-warm`. Don't invent new color tokens; add to the `@theme` block if you need one.
- **Animations** — CSS keyframes in `app/globals.css`. Use `.fade-rise` with `data-delay="N"` for staggered reveals. Respect `prefers-reduced-motion` (already wired).
- **Icons** — SVG only, never emoji. Reusable glyphs live in `components/decorations.tsx` (Sprout, LeafSpray, Sparkle, SunDrawing, Blob).
- **Images** — `next/image` from `/public/samples/` for sample art; decorative shapes stay inline SVG.

## Key directories

- `app/` — routes. `app/page.tsx` composes the landing page.
- `app/api/waitlist/route.ts` — POST endpoint for waitlist submissions.
- `components/` — UI sections (Hero, HowItWorks, SamplePreview, Waitlist, Footer, decorations).
- `lib/waitlist.ts` — Resend + Postgres helpers used by the waitlist route.
- `public/samples/` — marketing sample images (rendered from the Seed book in the companion repo).

## Env vars

See `.env.example`. In dev, `RESEND_API_KEY` and `DATABASE_URL` are optional — the waitlist endpoint succeeds without them and logs one warning per cold start. In prod, set both on Vercel.

## Companion project

The book-generation pipeline lives at `/Users/andrewdalton/CLAUDE/story-hero-prototype/`. That repo owns the 4 stories, 8 companions, settings system, and render scripts. Journey Sprout will eventually call into that pipeline (ported into Inngest jobs) for real book generation. For now, this repo is the marketing + waitlist front door only.
