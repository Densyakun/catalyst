import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['googleapis'],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
