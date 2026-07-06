import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel maneja el output automáticamente */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;