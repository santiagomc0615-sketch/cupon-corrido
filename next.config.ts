import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // El asesor lee el conocimiento tributario en tiempo de ejecución
  outputFileTracingIncludes: { "/api/asesor": ["./lib/impuestos/conocimiento.md"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
