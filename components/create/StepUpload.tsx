"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { LeafSpray, Sparkle, Sprout } from "../decorations";

type Props = {
  initialDataUrl?: string;
  onNext: (photoDataUrl: string) => void;
  onBack?: () => void;
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = "image/png,image/jpeg,image/heic,image/webp";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepUpload({ initialDataUrl, onNext, onBack }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(initialDataUrl ?? null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function ingestFile(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    setPreviewFailed(false);

    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      setError("That doesn't look like an image. Try a PNG, JPG, WEBP, or HEIC.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That photo is a bit big (${formatSize(file.size)}). Please keep it under 10 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        setError("We couldn't read that file. Mind trying another?");
        return;
      }
      setDataUrl(result);
      setFileMeta({ name: file.name, size: file.size });
    };
    reader.onerror = () => setError("We couldn't read that file. Mind trying another?");
    reader.readAsDataURL(file);
  }

  function handlePick() {
    inputRef.current?.click();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    ingestFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePick();
    }
  }

  const hasPhoto = Boolean(dataUrl);

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="relative mx-auto max-w-3xl px-6">
        <p className="eyebrow fade-rise flex items-center gap-3" data-delay="1">
          <span className="dot-rule"><span /><span /><span /></span>
          Step 1 of 5
        </p>

        <h1 className="font-display font-bold text-4xl md:text-5xl leading-[1.02] text-ink mt-5 fade-rise flex items-center gap-3" data-delay="2">
          Let&rsquo;s meet your hero.
          <Sparkle color="#CA8A04" className="w-6 h-6 opacity-90 float-soft" aria-hidden="true" />
        </h1>

        <p className="font-body text-lg text-ink-soft mt-5 max-w-xl leading-relaxed fade-rise" data-delay="3">
          Drop a clear, head-and-shoulders photo of your little one. We&rsquo;ll
          turn them into the hero of their own storybook.
        </p>

        <div className="mt-10 fade-rise" data-delay="4">
          <label htmlFor="hero-photo" className="sr-only">Upload a photo of your child</label>
          <input
            ref={inputRef}
            id="hero-photo"
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => ingestFile(e.target.files?.[0])}
          />

          {!hasPhoto ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a photo: click, press Enter, or drop a file here"
              onClick={handlePick}
              onKeyDown={handleKey}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`paper-grain relative overflow-hidden rounded-[28px] min-h-[320px] flex flex-col items-center justify-center text-center px-8 py-12 cursor-pointer transition-colors duration-200 focus:outline-none focus-visible:outline-3 focus-visible:outline-gold-soft ${
                dragActive
                  ? "bg-paper-deep border-2 border-solid border-sage"
                  : "bg-paper border-[3px] border-dashed border-warm hover:bg-paper-deep"
              }`}
              style={{ outlineOffset: 3 }}
            >
              <Sprout color="#7FA075" className="absolute top-5 left-5 w-10 opacity-70" />
              <LeafSpray color="#CA8A04" className="absolute bottom-4 right-4 w-24 opacity-50" />
              <Sparkle color="#C9672A" className="absolute top-6 right-8 w-4 opacity-70 float-soft" />

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-cream border border-border-warm flex items-center justify-center mb-5 shadow-sm">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-sage-deep" fill="none" aria-hidden="true">
                    <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="font-display text-xl text-ink">Drop a photo here</p>
                <p className="text-sm text-ink-muted mt-2">or</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePick(); }}
                  className="btn-ghost mt-3"
                >
                  Choose from your device
                </button>
                <p className="text-xs text-ink-muted mt-5">PNG, JPG, WEBP, or HEIC &middot; up to 10 MB</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <figure
                className="relative rounded-[28px] overflow-hidden bg-paper w-full max-w-md flex items-center justify-center"
                style={{
                  minHeight: "280px",
                  maxHeight: "560px",
                  boxShadow:
                    "0 40px 60px -30px rgba(45, 27, 15, 0.35), 0 10px 18px -6px rgba(45, 27, 15, 0.18)",
                }}
              >
                {dataUrl && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dataUrl}
                    alt="Your uploaded hero photo"
                    className="w-full h-auto max-h-[560px] object-contain"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center px-8 bg-paper-deep">
                    <Sprout color="#7FA075" className="w-12 opacity-80 mb-3" />
                    <p className="font-display text-lg text-ink">Preview unavailable</p>
                    <p className="text-sm text-ink-soft mt-1">HEIC photos don&rsquo;t preview inline, but we&rsquo;ve got it safe.</p>
                  </div>
                )}
              </figure>
              {fileMeta && (
                <p className="text-xs text-ink-muted mt-3 font-body">
                  {fileMeta.name} &middot; {formatSize(fileMeta.size)}
                </p>
              )}
              <button
                type="button"
                onClick={handlePick}
                className="mt-4 text-sm text-sage-deep prose-link font-body focus:outline-none focus-visible:outline-2 focus-visible:outline-gold-soft rounded"
              >
                Choose a different photo
              </button>
            </div>
          )}

          {error && (
            <p
              aria-live="polite"
              className="mt-4 text-sm text-terracotta font-body"
            >
              {error}
            </p>
          )}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 fade-rise" data-delay="5">
          {onBack ? (
            <button type="button" onClick={onBack} className="btn-ghost">Back</button>
          ) : <span />}

          <button
            type="button"
            disabled={!hasPhoto}
            onClick={() => dataUrl && onNext(dataUrl)}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-terracotta"
          >
            Continue
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
              <path d="M4 10 L 16 10 M 11 5 L 16 10 L 11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <p className="mt-5 text-xs text-ink-muted flex items-start gap-2 max-w-xl">
          <Sprout color="#7FA075" className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Your photo is used only to paint the hero in your book, and is
          automatically deleted from our servers after 30 days.
        </p>
      </div>
    </section>
  );
}
