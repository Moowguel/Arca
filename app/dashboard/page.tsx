import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { Selo } from "@/app/components/Selo";
import { GraficoBarrasH, GraficoColunas, GraficoLinha } from "@/app/components/Graficos";
import { CATEGORIAS, RISCOS, horasAtras } from "@/lib/rotulos";
import { Filtros } from "./Filtros";

type Busca = Promise<{ periodo?: string; bairro?: string; categoria?: string }>;

const HORAS: Record<string, number> = { "24h": 24, "3d": 72, "7d": 168, "30d": 720 };
const ABERTOS = ["aberto", "em_analise", "em_atendimento"];

export default function Dashboard({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-arca-marinho">Painel de dados</h1>
        <p className="text-sm text-slate-600">
          Sensores dos córregos + chamados dos moradores, para decidir onde agir primeiro.
        </p>
      </div>
      <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-2xl bg-white" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Situacao = {
  bairro_id: number; bairro: string; regiao: string; nivel_cm: number | null; chuva_mm_h: number | null;
  chuva_acumulada_24h: number; chamados_abertos: number; chamados_graves_abertos: number;
  indice_risco: number; classificacao_risco: string; ranking: number;
};
type LeituraHora = { hora: string; tipo: "nivel" | "chuva"; media: number };
type ChamadoDia = {
  dia: string; bairro: string; categoria: string; prioridade: string; status: string;
  qtd: number; resolvidos: number; horas_medias_resolucao: number | null;
};

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const periodo = HORAS[q.periodo ?? ""] ? q.periodo! : "7d";
  const categoria = q.categoria && CATEGORIAS[q.categoria] ? q.categoria : "";
  const supabase = await createClient();
  const desde = horasAtras(HORAS[periodo]);

  const { data: situacao } = await supabase
    .from("v_situacao_bairros")
    .select("bairro_id, bairro, regiao, nivel_cm, chuva_mm_h, chuva_acumulada_24h, chamados_abertos, chamados_graves_abertos, indice_risco, classificacao_risco, ranking")
    .order("ranking")
    .returns<Situacao[]>();
  const bairros = situacao ?? [];
  const bairroSel = bairros.find((b) => String(b.bairro_id) === q.bairro) ?? null;
  // gráficos de sensor mostram o bairro escolhido ou, em "Todos", o de maior risco
  const bairroSensor = bairroSel ?? bairros[0];

  let qChamados = supabase
    .from("v_chamados_diario")
    .select("dia, bairro, categoria, prioridade, status, qtd, resolvidos, horas_medias_resolucao")
    .gte("dia", desde.toISOString().slice(0, 10));
  if (bairroSel) qChamados = qChamados.eq("bairro", bairroSel.bairro);
  if (categoria) qChamados = qChamados.eq("categoria", categoria);

  let qAlertas = supabase.from("alertas").select("id", { count: "exact", head: true }).eq("ativo", true);
  if (bairroSel) qAlertas = qAlertas.eq("bairro_id", bairroSel.bairro_id);

  const [{ data: leituras }, { data: chamadosDia }, { count: alertasAtivos }, { data: qualidade }] = await Promise.all([
    bairroSensor
      ? supabase
          .from("v_leituras_por_hora")
          .select("hora, tipo, media")
          .eq("bairro_id", bairroSensor.bairro_id)
          .gte("hora", desde.toISOString())
          .order("hora")
          .returns<LeituraHora[]>()
      : Promise.resolve({ data: [] as LeituraHora[] }),
    qChamados.returns<ChamadoDia[]>(),
    qAlertas,
    supabase.from("v_qualidade_ingestao").select("recebidas, aceitas, rejeitadas").gte("dia", desde.toISOString().slice(0, 10)),
  ]);

  // ---------------- indicadores (KPIs) ----------------
  const linhas = chamadosDia ?? [];
  const total = linhas.reduce((s, l) => s + l.qtd, 0);
  const abertos = linhas.filter((l) => ABERTOS.includes(l.status)).reduce((s, l) => s + l.qtd, 0);
  const criticosAbertos = linhas
    .filter((l) => ABERTOS.includes(l.status) && l.prioridade === "critica")
    .reduce((s, l) => s + l.qtd, 0);
  const resolvidos = linhas.reduce((s, l) => s + l.resolvidos, 0);
  const comTempo = linhas.filter((l) => l.horas_medias_resolucao != null);
  const horasMedias = comTempo.length
    ? comTempo.reduce((s, l) => s + l.horas_medias_resolucao! * l.resolvidos, 0) / Math.max(1, comTempo.reduce((s, l) => s + l.resolvidos, 0))
    : null;
  const recebidas = (qualidade ?? []).reduce((s, l) => s + l.recebidas, 0);
  const aceitas = (qualidade ?? []).reduce((s, l) => s + l.aceitas, 0);

  // ---------------- séries ----------------
  const nivel = (leituras ?? []).filter((l) => l.tipo === "nivel").map((l) => ({ x: l.hora, y: Number(l.media) }));
  const chuvaPorHora = (leituras ?? []).filter((l) => l.tipo === "chuva");
  // em períodos longos, agrega a chuva por dia para as colunas caberem
  const chuva =
    HORAS[periodo] > 72
      ? Object.entries(
          chuvaPorHora.reduce<Record<string, number>>((acc, l) => {
            const d = new Date(l.hora).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
            acc[d] = (acc[d] ?? 0) + Number(l.media);
            return acc;
          }, {}),
        ).map(([d, v]) => ({ rotulo: d, valor: Math.round(v * 10) / 10, dica: `Dia ${d}` }))
      : chuvaPorHora.map((l) => {
          const h = new Date(l.hora).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit" });
          return { rotulo: `${h}h`, valor: Number(l.media), dica: new Date(l.hora).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) };
        });

  const porCategoria = Object.entries(
    linhas.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.categoria]: (acc[l.categoria] ?? 0) + l.qtd }), {}),
  )
    .map(([c, v]) => ({ rotulo: CATEGORIAS[c] ?? c, valor: v }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-4">
      <Filtros
        atuais={{ periodo, bairro: bairroSel ? String(bairroSel.bairro_id) : "", categoria }}
        bairros={bairros.map((b) => ({ valor: String(b.bairro_id), rotulo: b.bairro })).sort((a, b) => a.rotulo.localeCompare(b.rotulo))}
        categorias={Object.entries(CATEGORIAS).filter(([k]) => k !== "outro").map(([valor, rotulo]) => ({ valor, rotulo }))}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Chamados abertos" valor={abertos} detalhe={`${criticosAbertos} críticos`} destaque={criticosAbertos > 0} />
        <Kpi rotulo="Taxa de resolução" valor={total ? `${Math.round((resolvidos / total) * 100)}%` : "—"} detalhe={`${resolvidos} de ${total} no período`} />
        <Kpi rotulo="Tempo médio p/ resolver" valor={horasMedias != null ? `${horasMedias.toFixed(1)} h` : "—"} detalhe="da abertura à solução" />
        <Kpi rotulo="Alertas ativos" valor={alertasAtivos ?? 0} detalhe={`dados aproveitados: ${recebidas ? Math.round((aceitas / recebidas) * 100) : 0}%`} destaque={(alertasAtivos ?? 0) > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo={`Nível do córrego — ${bairroSensor?.bairro ?? ""}`} subtitulo="Média por hora (cm). Linhas tracejadas: limites de atenção e crítico.">
          <GraficoLinha
            titulo="Nível do córrego por hora"
            pontos={nivel}
            unidade="cm"
            limites={[
              { valor: 150, rotulo: "Atenção", cor: "#b45309" },
              { valor: 220, rotulo: "Crítico", cor: "#b91c1c" },
            ]}
          />
        </Cartao>
        <Cartao titulo={`Chuva — ${bairroSensor?.bairro ?? ""}`} subtitulo={HORAS[periodo] > 72 ? "Acumulado por dia (mm)" : "Intensidade por hora (mm/h)"}>
          <GraficoColunas titulo="Chuva" itens={chuva} unidade={HORAS[periodo] > 72 ? "mm" : "mm/h"} />
        </Cartao>
        <Cartao titulo="Chamados por tipo de problema" subtitulo="Classificação da IA no período">
          <GraficoBarrasH itens={porCategoria} unidade="chamados" />
        </Cartao>
        <Cartao titulo="Onde agir primeiro" subtitulo="Índice de risco = sensores + chamados + histórico do bairro">
          <ol className="divide-y divide-slate-100">
            {bairros.map((b) => (
              <li key={b.bairro_id} className={`flex items-center gap-3 py-2.5 ${bairroSel && bairroSel.bairro_id !== b.bairro_id ? "opacity-50" : ""}`}>
                <span className="w-5 text-center font-mono text-sm text-slate-400">{b.ranking}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.bairro}</p>
                  <p className="text-xs text-slate-500">
                    {b.nivel_cm ?? "—"} cm · {b.chuva_acumulada_24h} mm/24h · {b.chamados_abertos} chamados
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold">{b.indice_risco}</span>
                <Selo valor={b.classificacao_risco} texto={RISCOS[b.classificacao_risco]} />
              </li>
            ))}
          </ol>
        </Cartao>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string | number; detalhe: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ${destaque ? "ring-2 ring-amber-300" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-arca-marinho sm:text-3xl">{valor}</p>
      <p className="text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="mb-3 text-xs text-slate-500">{subtitulo}</p>
      {children}
    </section>
  );
}
