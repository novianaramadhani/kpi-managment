import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next_fresh",
  devIndicators: false,
  allowedDevOrigins: ["kpi.noviana.app"],
  experimental: {
    serverActions: {
      allowedOrigins: ["kpi.noviana.app"],
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
        // Hindari browser caching berlebih di environment dev agar perubahan kode langsung terlihat
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
