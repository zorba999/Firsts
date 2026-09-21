import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 builds with Turbopack by default; an empty block keeps that
  // explicit and leaves room for bundler tweaks if genlayer-js ever needs one.
  turbopack: {},
};

export default nextConfig;
