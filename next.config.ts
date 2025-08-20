import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Enable streaming optimizations
    serverMinification: true,
    // Optimize bundle splitting for streaming
    optimizeCss: true,
  },
  serverExternalPackages: ["shiki", "vscode-oniguruma"],
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
}

export default nextConfig
