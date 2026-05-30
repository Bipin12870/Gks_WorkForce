import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ['firebase-admin', 'google-gax', '@google-cloud/firestore'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
