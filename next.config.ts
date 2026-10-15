import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@modelcontextprotocol/sdk'],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
