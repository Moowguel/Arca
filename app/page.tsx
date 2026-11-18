import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { Selo } from "@/app/components/Selo";
import { RISCOS, formatarDataHora } from "@/lib/rotulos";

type Alerta = {
  id: string;
  nivel: "atencao" | "critico";
  titulo: string;
  mensagem: string;
  criado_em: string;
  bairros: { nome: string } | null;
};

type SituacaoBairro = {
  bairro_id: number;
  bairro: string;
  regiao: string;
  nivel_cm: number | null;
  chuva_mm_h: number | null;
  chuva_acumulada_24h: number;
  chamados_abertos: number;
  indice_risco: number;
  classificacao_risco: string;
  nivel_medido_em: string | null;
};

export default function Inicio() {
  return (
    <div className="space-y-6 md:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-arca-marinho px-5 pt-6 pb-36 text-white sm:px-8 sm:pb-8 md:pr-[45%]">
        <Image
          src="/arca-ondas.webp"
          alt=""
          width={1400}
          height={594}
          priority
          className="pointer-events-none absolute -right-10 bottom-0 w-[115%] max-w-none opacity-90 sm:w-[80%] md:top-1/2 md:right-0 md:bottom-auto md:w-[50%] md:-translate-y-1/2"
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-widest text-arca-claro uppercase">Zeladoria + alerta de enchentes</p>
          <h1 className="mt-2 text-2xl leading-tight font-bold sm:text-3xl">Viu um risco de alagamento? Avise o seu bairro.</h1>
          <p className="mt-2 text-sm text-slate-200 sm:text-base">
            Bueiro entupido, lixo acumulado ou córrego cheio de terra: fotografe e reporte. Sensores nos córregos
            medem a água em tempo real e a IA prioriza o que precisa de atendimento primeiro.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/chamados/novo" className="rounded-xl bg-white px-4 py-3 font-semibold text-arca-marinho hover:bg-arca-nevoa">
              Reportar um risco
            </Link>
            <Link href="/dashboard" className="rounded-xl px-4 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
              Ver indicadores
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Alertas ativos</h2>
          <Link href="/alertas" className="text-sm font-semibold text-arca-azul">Ver todos →</Link>
        </div>
        <Suspense fallback={<Carregando altura="h-28" />}>
          <AlertasAtivos />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Situação dos bairros agora</h2>
        <Suspense fallback={<Carregando altura="h-64" />}>
          <SituacaoBairros />
        </Suspense>
      </section>
    </div>
  );
}

function Carregando({ altura }: { altura: string }) {
  return <div className={`${altura} animate-pulse rounded-2xl bg-white`} />;
}

async function AlertasAtivos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alertas")
    .select("id, nivel, titulo, mensagem, criado_em, bairros(nome)")
    .eq("ativo", true)
    .order("criado_em", { ascending: false })
    .returns<Alerta[]>();

  if (error) return <ErroDados mensagem={error.message} />;
  if (!data?.length) {
    return (
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
        Nenhum alerta ativo no momento.
      </p>
    );
  }

  const ordenados = [...data].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {ordenados.map((a) => (
        <li
          key={a.id}
          className={`rounded-2xl border-l-4 bg-white p-4 shadow-sm ${a.nivel === "critico" ? "border-red-600" : "border-amber-500"}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <Selo valor={a.nivel} texto={a.nivel === "critico" ? "Crítico" : "Atenção"} />
            <span className="text-xs text-slate-500">
              {a.bairros?.nome} · {formatarDataHora(a.criado_em)}
            </span>
          </div>
          <h3 className="font-semibold">{a.titulo}</h3>
          <p className="mt-1 text-sm text-slate-600">{a.mensagem}</p>
        </li>
      ))}
    </ul>
  );
}

async function SituacaoBairros() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_situacao_bairros")
    .select("bairro_id, bairro, regiao, nivel_cm, chuva_mm_h, chuva_acumulada_24h, chamados_abertos, indice_risco, classificacao_risco, nivel_medido_em")
    .order("indice_risco", { ascending: false })
    .returns<SituacaoBairro[]>();

  if (error) return <ErroDados mensagem={error.message} />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data?.map((b) => (
        <article key={b.bairro_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{b.bairro}</h3>
              <p className="text-xs text-slate-500">Zona {b.regiao}</p>
            </div>
            <Selo valor={b.classificacao_risco} texto={`Risco ${RISCOS[b.classificacao_risco] ?? b.classificacao_risco}`} />
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`Índice de risco ${b.indice_risco} de 100`}>
            <div
              className={`h-full rounded-full ${
                b.indice_risco >= 70 ? "bg-red-600" : b.indice_risco >= 45 ? "bg-orange-500" : b.indice_risco >= 25 ? "bg-amber-400" : "bg-emerald-500"
              }`}
              style={{ width: `${b.indice_risco}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-slate-500">Índice {b.indice_risco}/100</p>

          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] text-slate-500">Córrego</dt>
              <dd className="font-semibold">{b.nivel_cm ?? "—"} cm</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] text-slate-500">Chuva</dt>
              <dd className="font-semibold">{b.chuva_mm_h ?? "—"} mm/h</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-[11px] text-slate-500">Chamados</dt>
              <dd className="font-semibold">{b.chamados_abertos}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function ErroDados({ mensagem }: { mensagem: string }) {
  return (
    <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Não foi possível carregar os dados: {mensagem}
    </p>
  );
}
