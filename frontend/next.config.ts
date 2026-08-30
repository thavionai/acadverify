import type { NextConfig } from "next";

/**
 * The browser talks to the backend through this origin. Same-origin by
 * default via the rewrite below, so there is no CORS to configure and no
 * environment variable to remember.
 *
 * 127.0.0.1 rather than localhost on purpose: on hosts where localhost
 * resolves to ::1 first, the IPv6 attempt can stall before falling back.
 * Override BACKEND_ORIGIN when the API is elsewhere (a deployed environment,
 * or a different compose port mapping).
 */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  /**
   * Without this, `npm run dev` produces an application that cannot reach its
   * own API. lib/api.ts defaults to the relative "/api/v1", which resolved
   * against the Next dev server itself and 404'd every call — and because a
   * bare 404 was mapped to NOT_FOUND, the verification page told visitors
   * "No credential was found for this public ID" while the backend was
   * simply not wired up.
   *
   * The only other reference to a base URL in the repo was a commented-out
   * compose block setting NEXT_PUBLIC_API_URL, which is not the name
   * lib/api.ts reads (NEXT_PUBLIC_API_BASE_URL), so uncommenting it would not
   * have helped either.
   */
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
