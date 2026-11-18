"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { redigirAlerta } from "@/lib/ia/triagem";

const STATUS_VALIDOS = ["aberto", "em_analise", "em_atendimento", "resolvido", "descartado"];

async function exigirGestor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const { data } = await supabase.from("perfis").select("papel").eq("id", user.id).single();
  if (data?.papel !== "gestor") throw new Error("Acesso restrito à equipe de atendimento");
  return supabase;
}

export async function atualizarStatus(form: FormData) {
  const supabase = await exigirGestor();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  const observacao = String(form.get("observacao") ?? "").trim().slice(0, 500);
  if (!STATUS_VALIDOS.includes(status)) return;

  // o gatilho do banco registra a mudança no histórico e as datas
  const { error } = await supabase.from("chamados").update({ status }).eq("id", id);
  if (!error && observacao) {
    const { data: ultimo } = await supabase
      .from("chamado_historico")
      .select("id")
      .eq("chamado_id", id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();
    if (ultimo) await supabase.from("chamado_historico").update({ observacao }).eq("id", ultimo.id);
  }
  revalidatePath("/gestor");
  revalidatePath(`/chamados/${id}`);
}

export async function encerrarAlerta(form: FormData) {
  const supabase = await exigirGestor();
  await supabase
    .from("alertas")
    .update({ ativo: false, encerrado_em: new Date().toISOString() })
    .eq("id", String(form.get("id")));
  revalidatePath("/gestor");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export type EstadoAlerta = { erro?: string; ok?: string } | null;

export async function publicarAlerta(_: EstadoAlerta, form: FormData): Promise<EstadoAlerta> {
  const supabase = await exigirGestor();
  const bairroId = Number(form.get("bairro_id"));
  const nivel = form.get("nivel") === "critico" ? "critico" : "atencao";
  const motivo = String(form.get("motivo") ?? "").trim();
  if (!bairroId) return { erro: "Escolha o bairro." };
  if (motivo.length < 10 || motivo.length > 300) return { erro: "Descreva o motivo (10 a 300 caracteres)." };

  const { data: s } = await supabase
    .from("v_situacao_bairros")
    .select("bairro, indice_risco, classificacao_risco, nivel_cm, chuva_mm_h, chamados_abertos")
    .eq("bairro_id", bairroId)
    .single();
  if (!s) return { erro: "Bairro não encontrado." };

  const texto = await redigirAlerta({ bairro: s.bairro, nivel, motivo, contexto: s });

  // um alerta ativo por bairro e nível: substitui o anterior
  await supabase
    .from("alertas")
    .update({ ativo: false, encerrado_em: new Date().toISOString() })
    .eq("bairro_id", bairroId)
    .eq("nivel", nivel)
    .eq("ativo", true);
  const { error } = await supabase.from("alertas").insert({
    bairro_id: bairroId,
    nivel,
    origem: "manual",
    titulo: texto.titulo,
    mensagem: texto.mensagem,
    gerado_por: texto.gerado_por,
  });
  if (error) return { erro: "Não foi possível publicar: " + error.message };

  revalidatePath("/gestor");
  revalidatePath("/alertas");
  revalidatePath("/");
  return { ok: `Alerta publicado: “${texto.titulo}”${texto.gerado_por === "gemini" ? " (texto escrito pela IA)" : ""}` };
}

// ---------------------------------------------------------------------
// Diário de atendimento
// ---------------------------------------------------------------------
const TIPOS_ANDAMENTO = ["a_caminho", "chegada", "execucao", "concluido", "saida", "nota"] as const;
type TipoAndamento = (typeof TIPOS_ANDAMENTO)[number];

/** passos que também mudam o status do chamado */
const STATUS_POR_PASSO: Partial<Record<TipoAndamento, string>> = {
  a_caminho: "em_atendimento",
  chegada: "em_atendimento",
  execucao: "em_atendimento",
  concluido: "resolvido",
};

export type EstadoAndamento = { erro?: string; ok?: string } | null;

export async function registrarAndamento(_: EstadoAndamento, form: FormData): Promise<EstadoAndamento> {
  const supabase = await exigirGestor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chamadoId = String(form.get("chamado_id") ?? "");
  const tipo = String(form.get("tipo") ?? "") as TipoAndamento;
  const descricao = String(form.get("descricao") ?? "").trim().slice(0, 1000);
  const equipe = String(form.get("equipe") ?? "").trim().slice(0, 80);
  const interno = form.get("interno") === "on";

  if (!TIPOS_ANDAMENTO.includes(tipo)) return { erro: "Escolha o tipo de registro." };
  if (tipo === "nota" && descricao.length < 3) return { erro: "Escreva a anotação." };
  if (tipo === "concluido" && descricao.length < 5) return { erro: "Descreva o que foi feito para concluir." };

  const { data: chamado } = await supabase.from("chamados").select("status").eq("id", chamadoId).single();
  if (!chamado) return { erro: "Chamado não encontrado." };
  if (["resolvido", "descartado"].includes(chamado.status) && tipo !== "nota" && tipo !== "saida") {
    return { erro: "Chamado já encerrado. Reabra para registrar novos passos." };
  }

  const { error } = await supabase.from("chamado_andamento").insert({
    chamado_id: chamadoId,
    tipo,
    descricao: descricao || null,
    equipe: equipe || null,
    visivel_cidadao: !interno,
    registrado_por: user!.id,
  });
  if (error) return { erro: "Não foi possível registrar: " + error.message };

  const novoStatus = STATUS_POR_PASSO[tipo];
  if (novoStatus && novoStatus !== chamado.status) {
    await supabase.from("chamados").update({ status: novoStatus }).eq("id", chamadoId);
  }

  revalidatePath(`/chamados/${chamadoId}`);
  revalidatePath("/gestor");
  return { ok: "Registrado." };
}

export async function reabrirChamado(form: FormData) {
  const supabase = await exigirGestor();
  const id = String(form.get("id") ?? "");
  await supabase.from("chamados").update({ status: "em_analise" }).eq("id", id);
  revalidatePath(`/chamados/${id}`);
  revalidatePath("/gestor");
}
