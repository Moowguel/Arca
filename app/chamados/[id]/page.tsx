import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { Selo } from "@/app/components/Selo";
import { CATEGORIAS, PRIORIDADES, STATUS, formatarDataHora, horasAtras } from "@/lib/rotulos";
import type { Chamado } from "@/lib/tipos-chamado";
import { obterSessao } from "@/lib/sessao";
import { atualizarStatus, reabrirChamado } from "@/app/gestor/actions";
import { PainelAtendimento, PASSOS } from "./PainelAtendimento";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> };

export default function DetalheChamado(props: Props) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
        <Conteudo {...props} />
      </Suspense>
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Conteudo({ params, searchParams }: Props) {
  const [{ id }, { novo }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("chamados")
    .select("*, bairros(nome)")
    .eq("id", id)
    .maybeSingle<Chamado>();
  if (!c) notFound(); // não existe ou o RLS não deixa ver

  const [{ data: historico }, foto] = await Promise.all([
    supabase.from("chamado_historico").select("status_novo, criado_em, observacao").eq("chamado_id", id).order("criado_em"),
    c.foto_path ? supabase.storage.from("fotos-chamados").createSignedUrl(c.foto_path, 600) : Promise.resolve(null),
  ]);

  const det = c.ia_detalhes ?? {};
  const sessao = await obterSessao();
  const gestor = sessao.papel === "gestor";

  // diário de atendimento (o RLS já esconde as notas internas do morador)
  const { data: andamento } = await supabase
    .from("chamado_andamento")
    .select("id, tipo, descricao, equipe, visivel_cidadao, registrado_por, criado_em")
    .eq("chamado_id", id)
    .order("criado_em");

  // nomes de quem registrou (só a equipe consegue ler os perfis)
  const ids = [...new Set((andamento ?? []).map((a) => a.registrado_por).filter(Boolean))] as string[];
  const { data: perfis } = gestor && ids.length ? await supabase.from("perfis").select("id, nome").in("id", ids) : { data: [] };
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id, p.nome]));

  // linha do tempo única: mudanças de status + registros da equipe
  type Evento = { quando: string; icone: string; titulo: string; texto?: string | null; detalhe?: string; interno?: boolean };
  const eventos: Evento[] = [
    ...(historico ?? []).map((h) => ({
      quando: h.criado_em,
      icone: h.status_novo === "aberto" ? "📨" : h.status_novo === "resolvido" ? "🏁" : "🔄",
      titulo: h.status_novo === "aberto" ? "Chamado aberto" : `Status: ${STATUS[h.status_novo] ?? h.status_novo}`,
      texto: h.observacao,
    })),
    ...(andamento ?? []).map((a) => {
      const passo = PASSOS.find((p) => p.tipo === a.tipo);
      return {
        quando: a.criado_em,
        icone: passo?.icone ?? "•",
        titulo: passo?.rotulo ?? a.tipo,
        texto: a.descricao,
        detalhe: [a.equipe, gestor ? nomeDe.get(a.registrado_por ?? "") : "Equipe ARCA"].filter(Boolean).join(" · "),
        interno: !a.visivel_cidadao,
      };
    }),
  ].sort((x, y) => x.quando.localeCompare(y.quando));

  // tempo no local: soma dos intervalos chegada → saída
  let msNoLocal = 0;
  let chegou: number | null = null;
  for (const a of andamento ?? []) {
    if (a.tipo === "chegada" && chegou === null) chegou = new Date(a.criado_em).getTime();
    if (a.tipo === "saida" && chegou !== null) {
      msNoLocal += new Date(a.criado_em).getTime() - chegou;
      chegou = null;
    }
  }
  const emCampoAgora = chegou !== null;
  const fim = c.resolvido_em ? new Date(c.resolvido_em).getTime() : null;
  const duracao = (ms: number) => {
    const min = Math.round(ms / 60000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  };
  const ultimoPasso: string = (andamento ?? []).filter((a) => a.tipo !== "nota").at(-1)?.tipo ?? "";
  const SEGUINTE: Record<string, string> = { a_caminho: "chegada", chegada: "execucao", execucao: "concluido", concluido: "saida", saida: "nota" };
  const proximoPasso = SEGUINTE[ultimoPasso] ?? "a_caminho";
  const encerrado = ["resolvido", "descartado"].includes(c.status);

  return (
    <div className="space-y-4">
      <Link href={gestor ? "/gestor" : "/chamados"} className="inline-block text-sm font-medium text-arca-azul">
        ← {gestor ? "Painel do gestor" : "Meus chamados"}
      </Link>
      {novo && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <p className="font-semibold">Chamado registrado! Obrigado por cuidar do seu bairro.</p>
          <p className="text-sm">Acompanhe por aqui. Você verá cada mudança de status.</p>
        </div>
      )}

      <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {(foto?.data?.signedUrl || c.foto_url) && (
          <figure className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto?.data?.signedUrl ?? c.foto_url!} alt="Foto enviada no chamado" className="h-60 w-full object-cover" />
            {!foto?.data?.signedUrl && c.foto_url && (
              <figcaption className="absolute right-2 bottom-2 rounded bg-black/55 px-2 py-0.5 text-[10px] text-white">
                Foto ilustrativa · Wikimedia Commons
              </figcaption>
            )}
          </figure>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-slate-500">{c.protocolo}</span>
            <Selo tipo="status" valor={c.status} texto={STATUS[c.status] ?? c.status} />
          </div>
          <h1 className="mt-1 text-xl font-bold">{CATEGORIAS[c.ia_categoria ?? c.tipo_informado]}</h1>
          <p className="text-sm text-slate-500">
            {c.bairros?.nome} · aberto em {formatarDataHora(c.criado_em)}
            {c.referencia && ` · ${c.referencia}`}
          </p>
          <p className="mt-3 text-slate-700">{c.descricao}</p>
        </div>
      </article>

      {/* Resultado da triagem automática */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Triagem automática</h2>
          <span className="rounded-full bg-arca-nevoa px-2.5 py-0.5 text-xs font-medium text-arca-azul">
            {c.ia_modo === "gemini" ? `IA Gemini (${det.modelo})` : "Modo reserva por regras"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Prioridade</p>
            <p className="text-2xl font-bold text-arca-marinho">{c.prioridade_score ?? "—"}</p>
            {c.prioridade && <Selo valor={c.prioridade} texto={PRIORIDADES[c.prioridade]} />}
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Confiança</p>
            <p className="text-2xl font-bold text-arca-marinho">
              {c.ia_confianca != null ? `${Math.round(c.ia_confianca * 100)}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Tempo de triagem</p>
            <p className="text-2xl font-bold text-arca-marinho">
              {det.tempo_triagem_ms != null ? `${(det.tempo_triagem_ms / 1000).toFixed(1)}s` : "—"}
            </p>
          </div>
        </div>

        {c.ia_justificativa && <p className="mt-3 rounded-xl bg-arca-nevoa p-3 text-sm text-arca-marinho">“{c.ia_justificativa}”</p>}
        {c.ia_categoria && c.ia_categoria !== c.tipo_informado && (
          <p className="mt-2 text-xs text-slate-500">
            Você marcou “{CATEGORIAS[c.tipo_informado]}”; a IA reclassificou como “{CATEGORIAS[c.ia_categoria]}”.
          </p>
        )}

        {det.componentes && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-arca-azul">Como a prioridade foi calculada</summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {det.componentes.map((x) => (
                <li key={x.nome} className="flex items-start justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{x.nome}</span>
                    <span className="block text-xs text-slate-500">{x.explicacao}</span>
                  </span>
                  <span className="font-mono font-semibold">+{x.pontos}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {gestor && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Status do chamado</h2>
          {encerrado ? (
            <form action={reabrirChamado} className="flex items-center justify-between gap-3">
              <input type="hidden" name="id" value={c.id} />
              <p className="text-sm text-slate-600">Chamado {STATUS[c.status].toLowerCase()}.</p>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Reabrir</button>
            </form>
          ) : (
            <form action={atualizarStatus} className="space-y-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="observacao" maxLength={500} placeholder="Observação para o morador (opcional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <div className="grid grid-cols-3 gap-2 text-sm">
                {c.status === "aberto" && <button name="status" value="em_analise" className="rounded-lg bg-arca-azul py-2.5 font-semibold text-white">Em análise</button>}
                {c.status !== "em_atendimento" && <button name="status" value="em_atendimento" className="rounded-lg bg-arca-azul py-2.5 font-semibold text-white">Em atendimento</button>}
                <button name="status" value="resolvido" className="rounded-lg bg-emerald-600 py-2.5 font-semibold text-white">Resolvido</button>
                <button name="status" value="descartado" className="rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600">Descartar</button>
              </div>
            </form>
          )}
        </section>
      )}

      {gestor && <PainelAtendimento chamadoId={c.id} sugestao={proximoPasso} />}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Acompanhamento</h2>
          {emCampoAgora && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Equipe no local agora</span>}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">{fim ? "Tempo até resolver" : "Aberto há"}</p>
            <p className="font-bold text-arca-marinho">{duracao((fim ?? horasAtras(0).getTime()) - Date.parse(c.criado_em))}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Tempo da equipe no local</p>
            <p className="font-bold text-arca-marinho">{msNoLocal ? duracao(msNoLocal) : emCampoAgora ? "em andamento" : "—"}</p>
          </div>
        </div>

        <ol className="relative ml-3 border-l-2 border-arca-claro">
          {eventos.map((e, i) => (
            <li key={i} className="mb-4 ml-5 last:mb-0">
              <span className="absolute -left-[13px] grid h-6 w-6 place-items-center rounded-full bg-white text-sm ring-2 ring-arca-claro" aria-hidden="true">
                {e.icone}
              </span>
              <p className="font-medium">
                {e.titulo}
                {e.interno && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">interno</span>}
              </p>
              <p className="text-xs text-slate-500">{formatarDataHora(e.quando)}{e.detalhe && ` · ${e.detalhe}`}</p>
              {e.texto && <p className="mt-0.5 text-sm text-slate-700">{e.texto}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
