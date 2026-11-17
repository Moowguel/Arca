import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // gera .next/standalone: servidor mínimo usado na imagem Docker
  output: "standalone",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // o indicador do Next fica no topo para não cobrir a barra inferior do app
  devIndicators: { position: "top-right" },
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
