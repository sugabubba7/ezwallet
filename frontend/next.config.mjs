import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
// The browser only ever talks to this Next.js app (localhost:3000 in dev, the
// Vercel URL in production). Requests to /api/* are proxied server-side to
// FastAPI, so the HTTP-only session cookie is first-party and no CORS or token
// handling happens in the browser. BACKEND_URL is read at build time.
const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

if (process.env.VERCEL && !process.env.BACKEND_URL) {
  throw new Error("BACKEND_URL is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.");
}

const nextConfig = {
  reactStrictMode: true,
  // Pin the project root (silences the "multiple lockfiles" warning when a
  // stray package-lock.json exists in a parent folder).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Google Identity Services popups need same-origin-allow-popups.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
