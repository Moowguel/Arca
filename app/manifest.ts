import type { MetadataRoute } from "next";

/** Permite instalar o ARCA na tela inicial do celular (PWA) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARCA — Alerta de Risco Climático e Apoio",
    short_name: "ARCA",
    description: "Reporte riscos de alagamento e receba alertas do seu bairro.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b2a5b",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
