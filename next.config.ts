import type { NextConfig } from "next";

const privateLanOrigins = [
  "10.*.*.*",
  "192.168.*.*",
  ...Array.from({ length: 16 }, (_, index) => `172.${index + 16}.*.*`),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", ...privateLanOrigins],
};

export default nextConfig;
