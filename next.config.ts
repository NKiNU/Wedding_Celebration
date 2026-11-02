import type { NextConfig } from "next";

// Headers that cost nothing and cannot break the app: nobody may frame it (the admin's buttons would
// be clickable under another page), nothing is sniffed, and the browser gets no camera, microphone
// or location. A full script/connect CSP would need the Supabase and media hosts and Next's inline
// scripts allowed; add it when those hosts are known (docs/DEPLOY.md, "Hardening").
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // A stray lockfile in the user's home folder would otherwise be picked as the root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
