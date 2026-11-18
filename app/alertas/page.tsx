import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { Selo } from "@/app/components/Selo";
import { formatarDataHora, horasAtras } from "@/lib/rotulos";

type Alerta = {
  id: string;
  nivel: "atencao" | "critico";
  origem: "sensor" | "chamado" | "manual";
  titulo: string;
  mensagem: string;
  gerado_por: string;
  ativo: boolean;
  criado_em: string;
  encerrado_em: string | null;
  bairro_id: number;
  bairros: { nome: string; regiao: string } | null;
};

type Busca = Promise<{ bairro?: string }>;

const ORIGEM: Record<string, string> = {
  sensor: "Sensor do córrego",
  chamado: "Chamados dos moradores",
  manual: "Defesa Civil",
};

export default function PaginaAlertas({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-arca-marinho">Alertas de enchente</h1>
      <p className="mt-1 mb-4 text-sm text-slate-600">
        Gerados automaticamente quando os sensores passam do limite ou quando moradores confirmam alagamento.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { bairro } = await searchParams;
  const bairroId = Number(bairro) || null;
  const supabase = await createClient();

  let consulta = supabase
    .from("alertas")
    .select("id, nivel, origem, titulo, mensagem, gerado_por, ativo, criado_em, encerrado_em, bairro_id, bairros(nome, regiao)")
    .gte("criado_em", horasAtras(14 * 24).toISOString())
    .order("criado_em", { ascending: false })
    .limit(60);
  if (bairroId) consulta = consulta.eq("bairro_id", bairroId);

  const [{ data: alertas, error }, { data: bairros }] = await Promise.all([
    consulta.returns<Alerta[]>(),
    supabase.from("bairros").select("id, nome").order("nome"),
  ]);
  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">Erro: {error.message}</p>;

  const ativos = (alertas ?? []).filter((a) => a.ativo).sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));
  const encerrados = (alertas ?? []).filter((a) => !a.ativo);

  return (
    <div className="space-y-6">
      {/* filtro por bairro: chips roláveis, bons para o polegar */}
      <nav aria-label="Filtrar por bairro" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip href="/alertas" ativo={!bairroId}>Todos</Chip>
        {bairros?.map((b) => (
          <Chip key={b.id} href={`/alertas?bairro=${b.id}`} ativo={bairroId === b.id}>{b.nome}</Chip>
        ))}
      </nav>

      <section>
        <h2 className="mb-2 font-bold">Ativos agora ({ativos.length})</h2>
        {ativos.length === 0 ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            Nenhum alerta ativo{bairroId ? " neste bairro" : ""}. Continue atento em dias de chuva.
          </p>
        ) : (
          <ul className="space-y-3">{ativos.map((a) => <CartaoAlerta key={a.id} a={a} />)}</ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Últimos 14 dias</h2>
        {encerrados.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum alerta encerrado no período.</p>
        ) : (
          <ul className="space-y-3">{encerrados.map((a) => <CartaoAlerta key={a.id} a={a} />)}</ul>
        )}
      </section>

      <p className="rounded-2xl bg-arca-nevoa p-4 text-sm text-arca-marinho">
        Em emergência ligue <strong>199</strong> (Defesa Civil) ou <strong>193</strong> (Bombeiros).{" "}
        Viu um risco? <Link href="/chamados/novo" className="font-semibold underline">Reporte aqui</Link>.
      </p>
    </div>
  );
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${
        ativo ? "bg-arca-azul text-white ring-arca-azul" : "bg-white text-slate-700 ring-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}

function CartaoAlerta({ a }: { a: Alerta }) {
  const borda = !a.ativo ? "border-slate-300" : a.nivel === "critico" ? "border-red-600" : "border-amber-500";
  return (
    <li className={`rounded-2xl border-l-4 bg-white p-4 shadow-sm ${borda} ${a.ativo ? "" : "opacity-75"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Selo valor={a.nivel} texto={a.nivel === "critico" ? "⚠ Crítico" : "Atenção"} />
        {!a.ativo && <Selo tipo="status" valor="descartado" texto="Encerrado" />}
        <span className="ml-auto text-xs text-slate-500">{formatarDataHora(a.criado_em)}</span>
      </div>
      <h3 className="font-semibold">{a.titulo}</h3>
      <p className="mt-1 text-sm text-slate-600">{a.mensagem}</p>
      <p className="mt-2 text-xs text-slate-500">
        {a.bairros?.nome} · origem: {ORIGEM[a.origem]}
        {a.gerado_por === "gemini" && " · texto escrito por IA"}
        {a.encerrado_em && ` · encerrado em ${formatarDataHora(a.encerrado_em)}`}
      </p>
    </li>
  );
}
