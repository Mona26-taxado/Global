import type { NextConfig } from "next";
import os from "os";
import path from "path";

const empty = path.join(__dirname, "lib/empty-module.ts");

function lanDevHosts() {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if ((family === "IPv4" || family === "4") && !addr.internal) {
        hosts.add(addr.address);
      }
    }
  }
  try {
    const app = process.env.NEXT_PUBLIC_APP_URL;
    if (app) hosts.add(new URL(app).hostname);
  } catch {
    /* ignore invalid APP_URL */
  }
  for (const extra of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    const h = extra.trim().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    if (h) hosts.add(h);
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phone / TokenPocket on Wi‑Fi hits http://192.168.x.x:3000 — Next blocks /_next unless listed.
  allowedDevOrigins: lanDevHosts(),
  turbopack: { root: path.join(__dirname) },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@x402/evm": empty,
      "@x402/evm/upto/client": empty,
      "@x402/evm/exact/client": empty,
      "@x402/core/client": empty,
      "@x402/svm/exact/client": empty,
    };
    return config;
  },
};

export default nextConfig;
