import type { NextConfig } from "next"
import createMDX from "@next/mdx"

const withMDX = createMDX({})

// Static export: apps/web is entirely client-side (home + /log-in are "use client").
// Built via `next build` → `out/` dir, deployed as static HTML/JS to CF Pages.
// Switch to @opennextjs/cloudflare when we need SSR / edge runtime (Phase 3+).
const config: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
}

export default withMDX(config)
