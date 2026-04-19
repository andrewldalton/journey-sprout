import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory so Turbopack ignores the
  // parent-directory lockfile at ~/package-lock.json.
  turbopack: {
    root: __dirname,
  },
  // Bundle the content/ directory (manuscripts, setting sheets, companion
  // sheets) with the serverless functions that read from it.
  outputFileTracingIncludes: {
    "/api/inngest": ["./content/**/*"],
    "/api/orders": ["./content/**/*"],
    "/api/book/**": ["./content/**/*"],
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
