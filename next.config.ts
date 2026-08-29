import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Analysis tasks are collected by cron ticks, never inside a request, so
  // route handlers stay fast. This ceiling is a safety net, not a strategy.
  serverExternalPackages: ["@upstash/redis"],
};

export default nextConfig;
