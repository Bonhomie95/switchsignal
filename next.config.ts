import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native/heavy server deps that must not be bundled
  serverExternalPackages: ["@huggingface/transformers", "better-sqlite3"],
};

export default nextConfig;
