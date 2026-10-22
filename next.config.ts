import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next_fresh",
  devIndicators: false,
  allowedDevOrigins: ["kpi.noviana.app", "localhost:3000", "127.0.0.1:3000"],
  experimental: {
    serverActions: {
      allowedOrigins: ["kpi.noviana.app", "localhost:3000", "127.0.0.1:3000"],
    },
  },
  async redirects() {
    return [
      {
        source: "/penilaian",
        destination: "/input-kpi",
        permanent: true,
      },
      {
        source: "/penilaian/:id",
        destination: "/input-kpi?id=:id",
        permanent: true,
      },
      {
        source: "/master/template",
        destination: "/setup/templates",
        permanent: false,
      },
      {
        source: "/master/templates",
        destination: "/setup/templates",
        permanent: false,
      },
      {
        source: "/master-template",
        destination: "/setup/templates",
        permanent: false,
      },
      {
        source: "/templates",
        destination: "/setup/templates",
        permanent: false,
      },
      {
        source: "/template",
        destination: "/setup/templates",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
