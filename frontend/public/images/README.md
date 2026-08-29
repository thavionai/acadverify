# Images

Anything in `frontend/public/` is served from the site root, so
`public/images/hero/foo.webp` is reachable at `/images/hero/foo.webp`.

## Where to put things

| Folder | For |
|---|---|
| `hero/` | Large above-the-fold art (landing hero, section banners) |
| `sequence/` | Ordered frames for the landing page's scroll-driven zoom |
| `sections/` | Supporting illustrations inside page sections |
| `brand/` | Logo, wordmark, favicon source, OG/social card |

### `sequence/` has extra rules

`components/public/scroll-reveal.tsx` crossfades these frames as the reader
scrolls, so they are not independent images:

- **Same aspect ratio for every frame.** They are stacked in one `object-cover`
  container; a frame with a different ratio jumps at the crossfade.
- **Numbered in view order** — `00-`, `01-`, … The number *is* the sequence;
  the component maps them to scroll positions by index.
- **Each frame is a tighter crop of the one before it.** The zoom illusion is
  in the artwork, not in the CSS — the transform only adds a little drift.
- `00-` doubles as the landing hero, so the hero and the sequence open on the
  same shot with no second download.

## Format

- **WebP** where possible — roughly 25-35% smaller than PNG at the same quality.
  Most AI tools export PNG; converting is worth it for anything above ~200KB.
- **PNG** only when you need hard transparency and WebP misbehaves.
- **SVG** for logos and icons — infinitely scalable, tiny.

## Size

- Hero / full-bleed: **2400px** on the long edge is plenty, even for retina.
  Larger is wasted bytes.
- Section illustrations: **1200px** long edge.
- Keep any single image **under ~500KB** *as delivered*. `next/image` re-encodes
  and resizes, so the file in this folder is a build input, not what ships —
  a 1MB source at 2752px can serve a 380KB derivative. Measure the derivative
  (DevTools → Network, filter `_next/image`), not the file on disk.
- Heavily textured art (charcoal, impasto, film grain) compresses badly and will
  sit above the cap at any quality worth shipping. That is fine for full-bleed
  artwork below the fold, which loads lazily; it is not fine above the fold.
- The whole page budget matters more than any one asset.

## Naming

Lowercase, hyphenated, descriptive of content rather than placement:
`credential-verification.webp`, not `image1.png` or `hero2.png`. Placement
changes; content doesn't.

## Using them in components

Prefer `next/image` — it handles lazy loading, responsive `srcset`, and layout
stability. It needs explicit dimensions:

```tsx
import Image from "next/image";

<Image
  src="/images/hero/credential-verification.webp"
  alt="A verifier checking a credential without seeing the student's identity"
  width={1200}
  height={800}
  priority   // only for above-the-fold images
/>
```

`alt` text is not optional — it is read aloud by screen readers and shown if the
image fails to load. Describe what the image *conveys*, not that it is an image.
Use `alt=""` only for purely decorative art that adds no information.
