import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/dpstore",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.douglas.ro",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
