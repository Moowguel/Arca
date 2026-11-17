import type { Metadata, Viewport } from "next";
// fontes Geist empacotadas no projeto: o build não depende de internet (Docker/CI)
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Cabecalho, NavegacaoCelular } from "@/app/components/Cabecalho";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARCA — Alerta de Risco Climático e Apoio",
  description:
    "Zeladoria colaborativa e alertas de enchente por bairro: o cidadão aponta o risco, os sensores medem a água e a IA prioriza o atendimento.",
  applicationName: "ARCA",
  appleWebApp: { capable: true, title: "ARCA", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0b2a5b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <Cabecalho />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:pt-6 md:pb-8">{children}</main>
        <footer className="hidden border-t border-slate-200 py-4 text-center text-xs text-slate-500 md:block">
          ARCA · Global Solution FIAP 2026 · ODS 11 e 13
        </footer>
        <NavegacaoCelular />
      </body>
    </html>
  );
}
