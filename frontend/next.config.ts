import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.0.0/16', '10.0.0.0/8'],
};

export default nextConfig;
