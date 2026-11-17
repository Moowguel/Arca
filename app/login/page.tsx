import Image from "next/image";
import { Suspense } from "react";
import { FormularioLogin } from "./FormularioLogin";

type Busca = Promise<{ voltar?: string | string[] }>;

export default function PaginaLogin({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto max-w-md py-4 md:py-8">
      <Image src="/arca-logo.webp" alt="Logo do ARCA" width={120} height={68} className="mx-auto mb-4 h-auto w-28" priority />
      <h1 className="mb-1 text-center text-2xl font-bold text-arca-marinho">Acesse o ARCA</h1>
      <p className="mb-6 text-center text-sm text-slate-600">
        Entre para reportar riscos de alagamento e acompanhar seus chamados.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { voltar } = await searchParams;
  return <FormularioLogin voltar={typeof voltar === "string" ? voltar : "/"} />;
}
