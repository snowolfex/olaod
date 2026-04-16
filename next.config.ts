import type { NextConfig } from "next";

const privateLanOrigins = [
  "10.*.*.*",
  "192.168.*.*",
  ...Array.from({ length: 16 }, (_, index) => `172.${index + 16}.*.*`),
];

const extraDevOrigins = (process.env.OLOAD_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "174.50.61.196",
    ...privateLanOrigins,
    ...extraDevOrigins,
  ],
  output: "standalone",
};

export default nextConfig;
