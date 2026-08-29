"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Three full-width panels, one per problem, in the order they compound:
 * the fake is cheap, the check is slow, and the honest route exposes you.
 *
 * The page already spends its motion budget on the pinned zoom sequence above,
 * so this section deliberately does not repeat that trick. It is a calm
 * editorial triptych with one quiet reveal, leaving the sequence as the page's
 * single orchestrated moment.
 *
 * Three things drive the layout:
 *
 * - The artwork splits into two kinds, and they want opposite treatments.
 *   The tortoise and the puppet-hand are SCENES with real negative space, so
 *   they run full-bleed with the copy set into the empty part of each frame.
 *   The banknote is an OBJECT shot on pure black; overlaying copy on it just
 *   collides with the note. It gets a split instead, and because its own
 *   background is the same near-black as the page, the image has no visible
 *   edge — the note simply floats beside the text.
 * - Scrims are per-panel and stacked, angled to darken only the corner the
 *   copy occupies. A single flat scrim heavy enough for the small source line
 *   would grey out the whole illustration.
 * - Below `md` nothing is full-bleed. These are 16:9 and a phone viewport is
 *   roughly 1:2, so object-cover would show a narrow vertical slice and crop
 *   the subject out of two of the three. Small screens get each image at its
 *   native ratio with the copy underneath it.
 */

type Problem = {
  src: string;
  alt: string;
  figure: string;
  unit: string;
  title: string;
  body: string;
  source: string;
  /** "scene" overlays copy on the artwork; "object" sets it beside. */
  mode: "scene" | "object";
  /** Where the copy sits on the frame. Ignored for `object`. */
  placement: string;
  /** Stacked gradients, angled to spare each image's subject. */
  scrims: string[];
};

const PROBLEMS: Problem[] = [
  {
    src: "/images/problems/01-price.webp",
    alt: "A banknote in the style of US currency, denominated $49, wrapped in gold serpents.",
    figure: "$49",
    unit: "the going rate for a degree you did not earn",
    title: "Forgery used to need a printing press. Now it needs a checkout page.",
    body: "Forty-nine dollars buys a diploma and a matching transcript, embossed seal included. Fifty-nine for a college one. The vendors selling them run pricing pages and search ads — this is the indexed web, not some dark-web market.",
    source: "Vendor pricing observed directly, August 2026",
    mode: "object",
    placement: "",
    scrims: [],
  },
  {
    src: "/images/problems/02-speed.webp",
    alt: "A tortoise crossing an empty desert at dusk, carrying a sealed diploma in its mouth.",
    figure: "5–10",
    unit: "business days to confirm a single degree",
    title: "Nobody holds a role open for two weeks to check one line of a résumé.",
    body: "That is what it takes whenever a registrar has to answer in person — which is always, for an international credential. The best case is 24 hours, and only if the university already sits in a national clearinghouse. You find out which case you were in afterwards.",
    source: "iprospectcheck; Vertical Identity, 2026",
    mode: "scene",
    placement: "items-start justify-start",
    // Copy sits top-left; the tortoise is low and right. Darken the sky and
    // the left edge, leave the ground it is walking on alone.
    scrims: [
      "bg-linear-to-b from-ink-950 via-ink-950/70 to-ink-950/10",
      "bg-[linear-gradient(to_right,rgba(8,8,10,0.92)_0%,rgba(8,8,10,0.75)_30%,transparent_68%)]",
    ],
  },
  {
    src: "/images/problems/03-exposure.webp",
    alt: "A vast crowd of people beneath a giant hand in the sky, each one held on a puppet string.",
    figure: "62M",
    unit: "students exposed in a single breach",
    title: "And proving it the honest way means somebody stores all of you.",
    body: "Names, addresses, dates of birth, Social Security numbers, medical and academic records — taken from one school platform in January 2025. The way in was a single stolen password on a portal with no second factor, and it went unnoticed for nine days. The data leaked because it was there to leak.",
    source: "PowerSchool breach, January 2025",
    mode: "scene",
    placement: "items-end justify-end",
    // Copy sits bottom-right. Darken that corner only, so the hand and the
    // strings on the left stay legible.
    scrims: [
      "bg-linear-to-t from-ink-950/85 via-ink-950/35 to-transparent",
      "bg-[linear-gradient(to_left,rgba(8,8,10,0.96)_0%,rgba(8,8,10,0.88)_35%,transparent_62%)]",
    ],
  },
];

function Copy({ problem }: { problem: Problem }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The server-rendered and no-JS output is fully visible. The reveal only
  // arms once React has mounted, so a failed observer can never leave the
  // argument stuck at opacity 0.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    setArmed(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      className={`max-w-xl transition-[opacity,transform] duration-700 ease-out ${
        hidden ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <p className="font-mono text-6xl font-semibold leading-none tracking-tight text-gold-400 tabular-nums sm:text-7xl lg:text-8xl">
        {problem.figure}
      </p>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-gold-500">
        {problem.unit}
      </p>
      <h3 className="mt-7 text-balance text-2xl font-semibold leading-tight tracking-tight text-paper sm:text-4xl">
        {problem.title}
      </h3>
      <p className="mt-5 text-pretty leading-relaxed text-paper-dim sm:text-lg">
        {problem.body}
      </p>
      {/* paper-dim rather than paper-muted: this line sits over mid-tone gold
          artwork on two of the three panels, where muted fails contrast. */}
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.12em] text-paper-dim">
        {problem.source}
      </p>
    </div>
  );
}

function Frame({ problem }: { problem: Problem }) {
  return (
    <>
      <Image
        src={problem.src}
        alt={problem.alt}
        fill
        sizes={problem.mode === "object" ? "(min-width: 768px) 68vw, 100vw" : "100vw"}
        className={
          problem.mode === "object"
            ? "object-contain object-center mix-blend-lighten"
            : "object-cover object-center"
        }
      />
      {/* Scrims exist only to protect copy that overlays the artwork, which
          happens at `md` and up. Below that the copy sits underneath the
          image, so a scrim would dim the illustration for nothing. */}
      {problem.scrims.map((scrim) => (
        <div
          key={scrim}
          aria-hidden
          className={`absolute inset-0 hidden md:block ${scrim}`}
        />
      ))}
    </>
  );
}

function Panel({ problem }: { problem: Problem }) {
  if (problem.mode === "object") {
    return (
      <article className="relative border-t border-paper/10">
        <div className="md:grid md:min-h-[85svh] md:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
          <div className="relative aspect-video md:col-start-2 md:aspect-auto">
            <Frame problem={problem} />
          </div>
          <div className="flex items-center px-5 py-12 sm:px-8 md:col-start-1 md:row-start-1 md:py-16 md:pl-10 md:pr-6 lg:pl-16">
            <Copy problem={problem} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="relative border-t border-paper/10 md:min-h-[85svh]">
      <div className="relative aspect-video md:absolute md:inset-0 md:aspect-auto">
        <Frame problem={problem} />
      </div>
      <div
        className={`relative px-5 py-12 sm:px-8 md:absolute md:inset-0 md:flex md:px-10 md:py-16 lg:px-16 ${problem.placement}`}
      >
        <Copy problem={problem} />
      </div>
    </article>
  );
}

export function ProblemPanels() {
  return (
    <section aria-label="Three problems with academic credentials today">
      {PROBLEMS.map((problem) => (
        <Panel key={problem.src} problem={problem} />
      ))}
    </section>
  );
}
