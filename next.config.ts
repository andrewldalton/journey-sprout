import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory so Turbopack ignores the
  // parent-directory lockfile at ~/package-lock.json.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
