import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    return [
      {
        source: '/local-rpc',
        destination: 'http://127.0.0.1:8547', // Proxies the request to your node
      },
    ];
  },
};

export default nextConfig;
