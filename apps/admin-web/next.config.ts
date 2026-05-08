import type { NextConfig } from "next";
import path from "node:path";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const isDevelopment = process.env.NODE_ENV !== "production";
const scriptSrc = isDevelopment
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";
const connectSrc = [
  "'self'",
  apiBaseUrl,
  "http://localhost:3000",
  "http://localhost:8081",
];
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSrc}`,
  `connect-src ${Array.from(new Set(connectSrc)).join(" ")}`,
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@mobilis/api",
    "@mobilis/domain",
    "@mobilis/ui",
    "@mobilis/config",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "server-only": path.resolve(
        process.cwd(),
        "node_modules/server-only/empty.js",
      ),
    };

    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        react: path.resolve(process.cwd(), "node_modules/react"),
        "react-dom": path.resolve(process.cwd(), "node_modules/react-dom"),
        "react/jsx-runtime": path.resolve(
          process.cwd(),
          "node_modules/react/jsx-runtime.js",
        ),
      };
    }

    return config;
  },
};

export default nextConfig;
