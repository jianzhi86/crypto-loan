import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ['ethers'],
  // Pin the workspace root to this project. A stray package-lock.json in the
  // home directory otherwise makes Next infer the wrong root, which misroutes
  // .env discovery and output file tracing (causing DATABASE_URL to come back
  // empty and Prisma to fail with "the URL must start with the protocol file:").
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
