import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { Selo } from "@/app/components/Selo";
import { CATEGORIAS, PRIORIDADES, STATUS, formatarDataHora } from "@/lib/rotulos";
import type { Chamado } from "@/lib/tipos-chamado";

export default function MeusChamados() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-arca-marinho">Meus chamados</h1>
        <Link href="/chamados/novo" className="hidden rounded-xl bg-arca-azul px-4 py-2.5 text-sm font-semibold text-white md:inline-block">
          Reportar risco
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white" />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("chamados")
    .select("id, protocolo, tipo_informado, ia_categoria, descricao, prioridade, status, criado_em, bairros(nome)")
    .eq("autor_id", user!.id)
    .order("criado_em", { ascending: false })
    .returns<Chamado[]>();

  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">Erro ao carregar: {error.message}</p>;
  if (!data?.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">🌧️</p>
        <p className="mt-2 font-semibold">Você ainda não reportou nenhum risco.</p>
        <p className="text-sm text-slate-500">Viu um bueiro entupido ou lixo perto do córrego? Avise pelo botão +.</p>
        <Link href="/chamados/novo" className="mt-4 inline-block rounded-xl bg-arca-azul px-5 py-3 font-semibold text-white">
          Reportar agora
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((c) => (
        <li key={c.id}>
          <Link href={`/chamados/${c.id}`} className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-500">{c.protocolo}</span>
              <Selo tipo="status" valor={c.status} texto={STATUS[c.status] ?? c.status} />
            </div>
            <p className="mt-1 font-semibold">{CATEGORIAS[c.ia_categoria ?? c.tipo_informado]}</p>
            <p className="line-clamp-2 text-sm text-slate-600">{c.descricao}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{c.bairros?.nome} · {formatarDataHora(c.criado_em)}</span>
              {c.prioridade && <Selo valor={c.prioridade} texto={`Prioridade ${PRIORIDADES[c.prioridade]}`} />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
