import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: [
    "@pump-fun/pump-sdk",
    "@pump-fun/pump-swap-sdk",
  ],
  turbopack: {},
};

export default nextConfig;
