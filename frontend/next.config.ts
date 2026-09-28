import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image (F6).
  output: "standalone",
};

export default nextConfig;
