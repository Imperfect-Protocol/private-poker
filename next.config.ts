import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
