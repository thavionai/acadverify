import Image from "next/image";
import { IconCheck } from "@/components/icons";

/**
 * What we built, answering the three problems named above.
 *
 * The layout is deliberately the opposite of ProblemPanels. Those are
 * full-bleed and engulfing — you are inside the problem with no frame around
 * it. These are contained, bordered, and alternate on a regular rhythm. The
 * form is doing part of the argument: the problem is overwhelming, the answer
 * is ordered.
 *
 * The eyebrows name which problem each panel answers rather than numbering
 * them 01–04. These are four independent properties, not a sequence, and a
 * number would imply an order that does not exist.
 */

type Solution = {
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  body: string;
};

const SOLUTIONS: Solution[] = [
  {
    src: "/images/solutions/01-circuit.webp",
    alt: "A gold integrated circuit chip drawn in chalk, its traces radiating from a central core.",
    eyebrow: "How all of it is enforced",
    title: "The rules are mathematics, not a row in our database.",
    body: "Every check runs inside a zero-knowledge circuit: is this university authorised, does this record match what was published, did the graduate agree to share their GPA. There is no admin table to edit and no server that can be talked into saying yes. When a check fails there is no output to inspect — nothing is produced at all.",
  },
  {
    src: "/images/solutions/02-forgery.webp",
    alt: "A masked thief pouring milk into the keyhole of a heavy vault door, with a key lying unused on the floor.",
    eyebrow: "Answers the $49 fake",
    title: "Forging a credential here is milk in a keyhole.",
    body: "Issuing a degree publishes a fingerprint of the record and nothing else. To verify, the holder's copy is fingerprinted again inside the circuit and the two are compared. A forged record produces a different fingerprint, the comparison fails, and no proof comes out the other side. There is no forgery to catch, because none can be made — producing one would mean breaking SHA-256.",
  },
  {
    src: "/images/solutions/03-ledger.webp",
    alt: "A chalk diagram of a blockchain: hollow gold cubes linked by chains, every box empty.",
    eyebrow: "Answers the 62-million breach",
    title: "All of it public, and not one person named in it.",
    body: "The ledger holds three things: which universities are authorised, one fingerprint per credential, and a list of what has been revoked. No names, no grades, no documents — not even a hash of a name. The record itself never leaves the people already entitled to it. There is no store of student data here to breach, because we never built one.",
  },
  {
    src: "/images/solutions/04-identity.webp",
    alt: "A white rabbit at one corner of an elaborate gold maze, with a red cross marking a point it has no route to.",
    eyebrow: "Answers: why trust us at all?",
    title: "Your name is not hidden. There is nowhere to put it.",
    body: "A verification hands back a fixed shape with four slots — institution, degree, year, and, only with consent, GPA. There is no slot for the student. It is not a policy we remember to follow or a filter that could be switched off: code that tried to reveal the holder would not compile. Most systems promise not to share your identity. Here there is no route to it.",
  },
];

/** Everything true and shipping that does not need a full panel to explain. */
const SHIPPING = [
  "Verification in seconds rather than 5–10 business days, with no registrar in the loop",
  "A QR code on the certificate that resolves straight to the public verification page",
  "Revocation as on-chain state, so a withdrawn degree stops verifying immediately",
  "Four honest outcomes — valid, revoked, invalid proof, and proof material unavailable — so our own outage can never be reported as your forgery",
  "A cross-tenant revocation flaw found and fixed in our own contract: an authorised university could revoke another university's credentials",
  "A live tamper switch, so the forgery failing is a click during the demo rather than pre-baked data",
  "Identical API in mock and live mode, so a flaky devnet cannot take the demo down",
  "Grafana, Prometheus and Loki running as a separate stack that cannot interfere with the app",
];

const NEXT = [
  "proofs generated in the graduate's own wallet, so the platform never holds their record",
  "a portable credential wallet",
  "verification that reveals nothing at all — not even which credential was checked",
];

export function SolutionPanels() {
  return (
    <section
      aria-label="What we built to solve these problems"
      className="border-t border-paper/10 px-5 py-24 sm:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
          What we built
        </p>
        {/* Mirrors the problem headline clause for clause, in the same order. */}
        <h2 className="mt-5 max-w-4xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          The fake can&apos;t be made.
          <span className="block">The check takes seconds.</span>
          <span className="block text-gold-400">
            There&apos;s nothing here to steal.
          </span>
        </h2>

        <div className="mt-20 space-y-20 lg:space-y-28">
          {SOLUTIONS.map((solution, index) => (
            <article
              key={solution.src}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div
                className={`relative aspect-video overflow-hidden rounded-lg border border-paper/15 ${
                  // Alternate sides. Source order stays image-then-copy so the
                  // stacked mobile layout always leads with the artwork.
                  index % 2 === 1 ? "lg:col-start-2" : ""
                }`}
              >
                <Image
                  src={solution.src}
                  alt={solution.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-center"
                />
              </div>

              <div className={index % 2 === 1 ? "lg:col-start-1 lg:row-start-1" : ""}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
                  {solution.eyebrow}
                </p>
                <h3 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-tight text-paper sm:text-4xl">
                  {solution.title}
                </h3>
                <p className="mt-5 text-pretty leading-relaxed text-paper-dim sm:text-lg">
                  {solution.body}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* The rest of what shipped, stated plainly. Anything not built yet is
            in its own list below rather than blurred into this one. */}
        <div className="mt-24 border-t border-paper/15 pt-14">
          <h3 className="flex items-center gap-2.5 text-xl font-semibold text-paper">
            <span className="inline-flex h-2 w-2 rounded-full bg-gold-500" aria-hidden />
            Also working today
          </h3>
          <ul className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2">
            {SHIPPING.map((item) => (
              <li key={item} className="flex gap-3 text-paper-dim">
                <IconCheck className="mt-1 h-4 w-4 shrink-0 text-gold-500" aria-hidden />
                <span className="text-pretty leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-12 text-pretty leading-relaxed text-paper-muted">
            <span className="font-semibold text-paper">Not built yet:</span>{" "}
            {NEXT.join("; ")}.
          </p>
        </div>
      </div>
    </section>
  );
}
