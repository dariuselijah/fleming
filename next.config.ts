import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Pin Turbopack to this app when multiple lockfiles exist (e.g. ~/package-lock.json). */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Enable streaming optimizations
    serverMinification: true,
    // Optimize bundle splitting for streaming
    optimizeCss: true,
  },
  serverExternalPackages: ["shiki", "vscode-oniguruma"],
  // Remove all console logs in production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Optimize streaming response headers
  async headers() {
    return [
      {
        source: "/api/chat",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Connection",
            value: "keep-alive",
          },
          {
            key: "Transfer-Encoding",
            value: "chunked",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  eslint: {
    // @todo: remove before going live
    ignoreDuringBuilds: true,
  },
  turbopack: {
    root: turbopackRoot,
  },
}

export default nextConfig
