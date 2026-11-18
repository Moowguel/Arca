import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { obterSessao } from "@/lib/sessao";
import { Selo } from "@/app/components/Selo";
import { CATEGORIAS, PRIORIDADES, STATUS, formatarDataHora, horasAtras } from "@/lib/rotulos";
import { atualizarStatus, encerrarAlerta } from "./actions";
import { FormularioAlerta } from "./FormularioAlerta";
import { FiltrosGestor, type FiltrosAtuais } from "./FiltrosGestor";

type Busca = Promise<Partial<Record<"ver" | "q" | "bairro" | "prioridade" | "categoria" | "status" | "ordem", string>>>;

type ItemFila = {
  id: string;
  protocolo: string;
  tipo_informado: string;
  ia_categoria: string | null;
  ia_confianca: number | null;
  ia_justificativa: string | null;
  ia_modo: string | null;
  descricao: string;
  referencia: string | null;
  foto_path: string | null;
  foto_url: string | null;
  prioridade: string | null;
  prioridade_score: number | null;
  status: string;
  criado_em: string;
  bairro_id: number;
  bairros: { nome: string } | null;
};

const ABERTOS = ["aberto", "em_analise", "em_atendimento"];
const PROXIMO: Record<string, { status: string; rotulo: string }> = {
  aberto: { status: "em_analise", rotulo: "Iniciar análise" },
  em_analise: { status: "em_atendimento", rotulo: "Enviar equipe" },
  em_atendimento: { status: "resolvido", rotulo: "Marcar resolvido" },
};

export default function PainelGestor({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-arca-marinho">Painel do gestor</h1>
        <p className="text-sm text-slate-600">Fila ordenada pela prioridade calculada pela IA com os dados dos sensores.</p>
      </div>
      <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-2xl bg-white" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const [q, sessao] = await Promise.all([searchParams, obterSessao()]);
  if (!sessao.logado) redirect("/login?voltar=/gestor");
  if (sessao.papel !== "gestor") {
    return (
      <p className="rounded-2xl bg-amber-50 p-4 text-amber-800">
        Área restrita à equipe de atendimento. Entre com uma conta de gestor.
      </p>
    );
  }

  const ver = q.ver === "encerrados" ? "encerrados" : "fila";
  const statusDaAba = ver === "fila" ? ABERTOS : ["resolvido", "descartado"];
  const f: FiltrosAtuais = {
    ver,
    q: (q.q ?? "").slice(0, 60),
    bairro: Number(q.bairro) > 0 ? String(Number(q.bairro)) : "",
    prioridade: PRIORIDADES[q.prioridade ?? ""] ? q.prioridade! : "",
    categoria: CATEGORIAS[q.categoria ?? ""] ? q.categoria! : "",
    status: statusDaAba.includes(q.status ?? "") ? q.status! : "",
    ordem: ["antigos", "recentes"].includes(q.ordem ?? "") ? q.ordem! : "",
  };
  const bairroId = f.bairro ? Number(f.bairro) : null;
  const supabase = await createClient();

  let consulta = supabase
    .from("chamados")
    .select("id, protocolo, tipo_informado, ia_categoria, ia_confianca, ia_justificativa, ia_modo, descricao, referencia, foto_path, foto_url, prioridade, prioridade_score, status, criado_em, bairro_id, bairros(nome)")
    .in("status", f.status ? [f.status] : statusDaAba)
    .limit(50);
  if (ver === "encerrados") consulta = consulta.gte("criado_em", horasAtras(30 * 24).toISOString());
  if (bairroId) consulta = consulta.eq("bairro_id", bairroId);
  if (f.prioridade) consulta = consulta.eq("prioridade", f.prioridade);
  if (f.categoria) consulta = consulta.eq("ia_categoria", f.categoria);
  if (f.q) {
    // remove caracteres que têm significado na sintaxe de filtro da API
    const termo = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (termo) consulta = consulta.or(`protocolo.ilike.%${termo}%,descricao.ilike.%${termo}%,referencia.ilike.%${termo}%`);
  }
  consulta =
    f.ordem === "antigos"
      ? consulta.order("criado_em", { ascending: true })
      : f.ordem === "recentes"
        ? consulta.order("criado_em", { ascending: false })
        : consulta.order("prioridade_score", { ascending: false }).order("criado_em");

  // contadores por prioridade da aba atual (respeitam o bairro)
  let qContagem = supabase.from("chamados").select("prioridade").in("status", statusDaAba);
  if (ver === "encerrados") qContagem = qContagem.gte("criado_em", horasAtras(30 * 24).toISOString());
  if (bairroId) qContagem = qContagem.eq("bairro_id", bairroId);

  const [{ data: fila }, { data: bairros }, { data: alertas }, { data: contagem }] = await Promise.all([
    consulta.returns<ItemFila[]>(),
    supabase.from("bairros").select("id, nome").order("nome"),
    supabase.from("alertas").select("id, nivel, titulo, origem, criado_em, bairros(nome)").eq("ativo", true).order("criado_em", { ascending: false })
      .returns<{ id: string; nivel: string; titulo: string; origem: string; criado_em: string; bairros: { nome: string } | null }[]>(),
    qContagem,
  ]);
  const porPrioridade = (contagem ?? []).reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.prioridade ?? "sem"]: (acc[c.prioridade ?? "sem"] ?? 0) + 1 }),
    {},
  );
  const linkCom = (mudancas: Partial<FiltrosAtuais>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...mudancas })) if (v && !(k === "ver" && v === "fila")) p.set(k, v);
    return `/gestor${p.size ? `?${p}` : ""}`;
  };

  // miniaturas das fotos (links temporários de 10 min; o bucket é privado)
  const caminhos = (fila ?? []).map((c) => c.foto_path).filter(Boolean) as string[];
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("fotos-chamados").createSignedUrls(caminhos, 600)
    : { data: [] };
  const urlFoto = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3">
        <div className="grid grid-cols-2 rounded-xl bg-slate-200/70 p-1 text-sm font-medium sm:w-72">
          <Link href={linkCom({ ver: "fila", status: "" })} className={`rounded-lg px-3 py-1.5 text-center ${ver === "fila" ? "bg-white shadow-sm" : "text-slate-600"}`}>
            Fila de atendimento
          </Link>
          <Link href={linkCom({ ver: "encerrados", status: "" })} className={`rounded-lg px-3 py-1.5 text-center ${ver === "encerrados" ? "bg-white shadow-sm" : "text-slate-600"}`}>
            Encerrados
          </Link>
        </div>

        {/* contadores clicáveis: filtram por prioridade com um toque */}
        <div className="grid grid-cols-4 gap-2">
          {(["critica", "alta", "media", "baixa"] as const).map((p) => {
            const ativo = f.prioridade === p;
            return (
              <Link
                key={p}
                href={linkCom({ prioridade: ativo ? "" : p })}
                className={`rounded-xl p-2 text-center ring-1 ring-inset ${ativo ? "bg-arca-marinho text-white ring-arca-marinho" : "bg-white ring-slate-200"}`}
              >
                <span className="block text-xl font-bold">{porPrioridade[p] ?? 0}</span>
                <span className={`text-[11px] font-medium ${ativo ? "text-white" : "text-slate-500"}`}>{PRIORIDADES[p]}</span>
              </Link>
            );
          })}
        </div>

        <FiltrosGestor
          atuais={f}
          bairros={(bairros ?? []).map((b) => ({ valor: String(b.id), rotulo: b.nome }))}
          categorias={Object.entries(CATEGORIAS).filter(([k]) => k !== "outro").map(([valor, rotulo]) => ({ valor, rotulo }))}
          statusOpcoes={statusDaAba.map((v) => ({ valor: v, rotulo: STATUS[v] }))}
        />

        <p className="text-sm text-slate-500">
          {fila?.length ?? 0} chamado(s){fila?.length === 50 && " (mostrando os 50 primeiros)"}
        </p>

        {!fila?.length && <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">Nenhum chamado com esses filtros.</p>}

        <ol className="space-y-3">
          {fila?.map((c, i) => (
            <li key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="flex gap-3 p-3">
                <Link href={`/chamados/${c.id}`} className="shrink-0" aria-label={`Abrir chamado ${c.protocolo}`}>
                  {(c.foto_path && urlFoto.get(c.foto_path)) || c.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(c.foto_path && urlFoto.get(c.foto_path)) || c.foto_url!} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">sem foto</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {ver === "fila" && !f.ordem && <span className="font-mono text-xs text-slate-400">#{i + 1}</span>}
                    <span className="font-mono text-xs text-slate-500">{c.protocolo}</span>
                    <span className="ml-auto font-mono text-lg font-bold text-arca-marinho">{c.prioridade_score}</span>
                  </div>
                  <Link href={`/chamados/${c.id}`} className="block truncate font-semibold hover:text-arca-azul hover:underline">
                    {CATEGORIAS[c.ia_categoria ?? c.tipo_informado]}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {c.bairros?.nome}{c.referencia && ` · ${c.referencia}`} · {formatarDataHora(c.criado_em)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.prioridade && <Selo valor={c.prioridade} texto={PRIORIDADES[c.prioridade]} />}
                    <Selo tipo="status" valor={c.status} texto={STATUS[c.status]} />
                  </div>
                </div>
              </div>

              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-arca-azul">Atender chamado</summary>
                <div className="space-y-3 px-3 pb-3 text-sm">
                  <p className="text-slate-700">{c.descricao}</p>
                  {c.ia_justificativa && (
                    <p className="rounded-lg bg-arca-nevoa p-2 text-arca-marinho">
                      IA ({c.ia_modo === "gemini" ? "Gemini" : "regras"}, {Math.round((c.ia_confianca ?? 0) * 100)}%): {c.ia_justificativa}
                    </p>
                  )}
                  {ABERTOS.includes(c.status) && (
                    <form action={atualizarStatus} className="space-y-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="observacao" maxLength={500} placeholder="Observação para o morador (opcional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                      <div className="grid grid-cols-2 gap-2">
                        <button name="status" value={PROXIMO[c.status].status} className="rounded-lg bg-arca-azul py-2.5 font-semibold text-white">
                          {PROXIMO[c.status].rotulo}
                        </button>
                        <button name="status" value="descartado" className="rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600">
                          Descartar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Alertas ativos</h2>
          {!alertas?.length && <p className="text-sm text-slate-500">Nenhum alerta ativo.</p>}
          <ul className="space-y-2">
            {alertas?.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded-xl bg-slate-50 p-2.5">
                <div className="min-w-0 flex-1">
                  <Selo valor={a.nivel} texto={a.nivel === "critico" ? "Crítico" : "Atenção"} />
                  <p className="mt-1 text-sm font-medium">{a.titulo}</p>
                  <p className="text-xs text-slate-500">{a.bairros?.nome} · {a.origem} · {formatarDataHora(a.criado_em)}</p>
                </div>
                <form action={encerrarAlerta}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium">Encerrar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Publicar alerta</h2>
          <FormularioAlerta bairros={bairros ?? []} />
        </section>
      </aside>
    </div>
  );
}

