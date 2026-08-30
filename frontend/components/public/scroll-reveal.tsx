"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Scroll-driven zoom sequence: the camera pushes into one diploma hanging on
 * the tree until it unrolls to reveal a forgery.
 *
 * Implementation notes:
 *
 * - The section is tall; a sticky child pins the viewport while the page
 *   scrolls past it. Progress through the section (0..1) drives which frame is
 *   visible. Nothing is scroll-JACKED — the page still scrolls at its normal
 *   rate, so the scrollbar, keyboard paging and trackpad momentum all behave
 *   normally, and a reader who wants past it can flick through.
 * - Frames crossfade rather than swap, and each carries a scale that only ever
 *   increases, so the motion reads as one continuous push-in rather than five
 *   separate zooms. That scale never drops below 1: the images are
 *   object-cover, so anything under 1 would expose the container edge.
 * - Scroll position is read inside requestAnimationFrame. Measuring in the
 *   scroll handler itself forces a synchronous reflow on every event.
 * - Heights are in svh, not vh. On mobile, vh counts the area behind the
 *   browser's own chrome, which would make the pinned frame taller than the
 *   screen and push the captions out of sight.
 * - prefers-reduced-motion falls back to a plain stacked layout. A pinned,
 *   motion-heavy sequence is a common migraine and nausea trigger, and the
 *   argument here has to survive without it.
 */

type Frame = {
  src: string;
  /** Empty for frames that repeat the same subject — announcing five
   *  near-identical images would be noise. The narrative is in the captions,
   *  which are real text and are read in order. */
  alt: string;
  eyebrow: string;
  title: string;
  body: string;
};

const FRAMES: Frame[] = [
  {
    src: "/images/sequence/00-tree.webp",
    alt: "A golden tree with sealed diplomas hanging from its branches.",
    eyebrow: "Six graduates",
    title: "Every one of these is somebody's future.",
    body: "Sealed, ribboned, and signed by the institution that issued it. From here, they are identical.",
  },
  {
    src: "/images/sequence/01-zoom1.webp",
    alt: "",
    eyebrow: "Look closer",
    title: "A hiring manager sees this for seconds.",
    body: "Long enough to register a seal and a signature. Not long enough to call a registrar and wait days for an answer.",
  },
  {
    src: "/images/sequence/02-zoom2.webp",
    alt: "",
    eyebrow: "Closer",
    title: "The seal looks right. The paper looks right.",
    body: "Generative tools now produce diplomas and transcripts convincing enough to pass a careful human eye.",
  },
  {
    src: "/images/sequence/03-zoom3.webp",
    alt: "",
    eyebrow: "Closer still",
    title: "So what actually makes it real?",
    body: "Not the paper. Not the seal. Not the PDF. Only something the issuing university can prove — and that nobody else can produce.",
  },
  {
    src: "/images/sequence/04-reveal.webp",
    alt: "The diploma unrolls to reveal the word FAKE above a skull and crossbones.",
    eyebrow: "One of the six",
    title: "This one was never earned.",
    body: "You could not tell by looking. Neither could the employer who hired on it — and neither could the five honest graduates hanging beside it.",
  },
];

const LAST = FRAMES.length - 1;
/** Scroll fraction at which frame `i` is fully opaque and fully settled. */
const stopFor = (i: number) => i / LAST;
/** Scroll distance between two adjacent frames. */
const SPAN = 1 / LAST;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function ScrollReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let queued = 0;
    const measure = () => {
      queued = 0;
      const el = sectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // How far we have scrolled into the section, over how far it can travel
      // while pinned (its own height, less the one viewport it holds still for).
      const travel = rect.height - window.innerHeight;
      setProgress(travel <= 0 ? 0 : clamp(-rect.top / travel, 0, 1));
    };

    const onScroll = () => {
      if (queued) return;
      queued = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (queued) window.cancelAnimationFrame(queued);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reducedMotion]);

  // --- Reduced motion: same story, stacked, no pinning and no crossfade -----
  if (reducedMotion) {
    return (
      <section
        aria-label="How a forged credential hides in plain sight"
        className="border-t border-paper/10 bg-ink-950"
      >
        {FRAMES.map((frame) => (
          <div
            key={frame.src}
            className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2"
          >
            <Image
              src={frame.src}
              alt={frame.alt}
              width={1376}
              height={768}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="rounded-lg"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
                {frame.eyebrow}
              </p>
              <h3 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-paper">
                {frame.title}
              </h3>
              <p className="mt-4 text-pretty text-lg leading-relaxed text-paper-dim">
                {frame.body}
              </p>
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label="How a forged credential hides in plain sight"
      className="relative border-t border-paper/10 bg-ink-950"
      style={{ height: `${FRAMES.length * 100}svh` }}
    >
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        {/* Frames ------------------------------------------------------- */}
        {FRAMES.map((frame, index) => {
          const offset = progress - stopFor(index);
          // Opaque at its own stop, gone by the time its neighbour lands.
          const opacity = Math.max(0, 1 - Math.abs(offset) / SPAN);
          // Monotonically increasing, so every frame is still pushing forward
          // as it hands over to the next one. Floor of 1.02 keeps object-cover
          // from exposing the container edge.
          const scale = 1.1 + clamp(offset, -SPAN, SPAN) * 0.32;

          return (
            <div
              key={frame.src}
              className="absolute inset-0"
              style={{
                opacity,
                transform: `scale(${scale})`,
                // Lets the compositor drop the layer entirely once a frame is
                // off-screen. Five full-bleed layers held live is a lot of GPU
                // memory on a phone.
                visibility: opacity === 0 ? "hidden" : "visible",
                willChange: "opacity, transform",
              }}
            >
              <Image
                src={frame.src}
                alt={frame.alt}
                fill
                // All five load eagerly. A frame that pops in mid-scroll breaks
                // the illusion far worse than the extra bytes cost, and the set
                // is 2.2 MB total.
                priority={index < 2}
                loading={index < 2 ? undefined : "eager"}
                sizes="100vw"
                className="object-cover object-center"
              />
            </div>
          );
        })}

        {/* Scrim: the copy sits over the lower half, which is the busiest part
            of the artwork. Without this it fails contrast on most frames. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/75 to-ink-950/20"
        />

        {/* Captions ------------------------------------------------------ */}
        <div className="relative flex h-full items-end">
          <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
            {/* Grid rather than absolute positioning: every caption occupies
                the same cell, so the block is as tall as the longest one and
                nothing can overflow onto the progress rail. */}
            <div className="grid max-w-2xl">
              {FRAMES.map((frame, index) => {
                const offset = Math.abs(progress - stopFor(index));
                // Copy fades faster than the image so two captions are never
                // legible at the same time.
                const opacity = Math.max(0, 1 - offset / (SPAN * 0.6));
                const isReveal = index === LAST;

                return (
                  <div
                    key={frame.src}
                    className="col-start-1 row-start-1"
                    style={{
                      opacity,
                      transform: `translateY(${(1 - opacity) * 16}px)`,
                      pointerEvents: "none",
                    }}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.24em] ${
                        isReveal ? "text-[#e0524a]" : "text-gold-500"
                      }`}
                    >
                      {frame.eyebrow}
                    </p>
                    <h3 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
                      {frame.title}
                    </h3>
                    <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-paper-dim sm:text-lg">
                      {frame.body}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Progress rail. Decorative — the captions already say where you
                are, and announcing "frame 3 of 5" on every scroll tick would
                just talk over them. */}
            <div aria-hidden className="mt-10 flex gap-2">
              {FRAMES.map((frame, index) => (
                <span
                  key={frame.src}
                  className="h-0.5 flex-1 overflow-hidden rounded-full bg-paper/20"
                >
                  <span
                    className="block h-full rounded-full bg-gold-500"
                    style={{
                      transform: `scaleX(${clamp(
                        progress * LAST - index + 1,
                        0,
                        1,
                      )})`,
                      transformOrigin: "left",
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
