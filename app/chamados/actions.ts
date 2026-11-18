"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { triarChamado, redigirAlerta } from "@/lib/ia/triagem";
import { TIPOS_INFORMADOS, type ContextoBairro, type TipoInformado } from "@/lib/ia/tipos";

export type EstadoNovoChamado = { erro?: string } | null;

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];

export async function criarChamado(_: EstadoNovoChamado, form: FormData): Promise<EstadoNovoChamado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre novamente." };

  // ---------- validação de entrada (nunca confiar no navegador) ----------
  const tipo = String(form.get("tipo") ?? "") as TipoInformado;
  const descricao = String(form.get("descricao") ?? "").trim();
  const referencia = String(form.get("referencia") ?? "").trim().slice(0, 200);
  const bairroId = Number(form.get("bairro_id"));
  const fotoPath = String(form.get("foto_path") ?? "");
  const lat = form.get("lat") ? Number(form.get("lat")) : null;
  const lng = form.get("lng") ? Number(form.get("lng")) : null;

  if (!TIPOS_INFORMADOS.includes(tipo)) return { erro: "Escolha o tipo do problema." };
  if (descricao.length < 10) return { erro: "Descreva o problema com pelo menos 10 caracteres." };
  if (descricao.length > 1000) return { erro: "A descrição pode ter no máximo 1000 caracteres." };
  if (!Number.isInteger(bairroId) || bairroId <= 0) return { erro: "Escolha o bairro." };
  if (fotoPath && !fotoPath.startsWith(`${user.id}/`)) return { erro: "Foto inválida." };
  const coordenadasValidas =
    lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  // ---------- contexto do bairro vindo dos sensores (camada gold) ----------
  const { data: situacao } = await supabase
    .from("v_situacao_bairros")
    .select("bairro, indice_risco, classificacao_risco, nivel_cm, chuva_mm_h, chamados_abertos")
    .eq("bairro_id", bairroId)
    .maybeSingle();
  if (!situacao) return { erro: "Bairro não encontrado." };

  const contexto: ContextoBairro = {
    indice_risco: situacao.indice_risco ?? 0,
    classificacao_risco: situacao.classificacao_risco ?? "baixo",
    nivel_cm: situacao.nivel_cm,
    chuva_mm_h: situacao.chuva_mm_h,
    chamados_abertos: situacao.chamados_abertos ?? 0,
  };

  // ---------- foto (enviada direto do navegador para o Storage) ----------
  let foto: { base64: string; mimeType: string } | null = null;
  if (fotoPath) {
    const { data: arquivo } = await supabase.storage.from("fotos-chamados").download(fotoPath);
    if (arquivo && MIME_PERMITIDOS.includes(arquivo.type) && arquivo.size <= 5 * 1024 * 1024) {
      foto = { base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"), mimeType: arquivo.type };
    }
  }

  // ---------- triagem com IA + prioridade ----------
  const triagem = await triarChamado({ descricao, tipoInformado: tipo, foto, contexto });

  const { data: chamado, error } = await supabase
    .from("chamados")
    .insert({
      autor_id: user.id,
      bairro_id: bairroId,
      tipo_informado: tipo,
      descricao,
      referencia: referencia || null,
      lat: coordenadasValidas ? lat : null,
      lng: coordenadasValidas ? lng : null,
      foto_path: fotoPath || null,
      ia_categoria: triagem.classificacao.categoria,
      ia_confianca: Math.round(triagem.classificacao.confianca * 1000) / 1000,
      ia_justificativa: triagem.classificacao.justificativa,
      ia_modo: triagem.classificacao.modo,
      ia_detalhes: triagem.detalhes,
      prioridade_score: triagem.prioridade.score,
      prioridade: triagem.prioridade.prioridade,
    })
    .select("id")
    .single();

  if (error || !chamado) return { erro: "Não foi possível registrar o chamado. Tente de novo." };

  // ---------- alerta automático: alagamento confirmado com prioridade crítica ----------
  if (triagem.classificacao.categoria === "alagamento_ativo" && triagem.prioridade.prioridade === "critica") {
    try {
      const texto = await redigirAlerta({
        bairro: situacao.bairro,
        nivel: "critico",
        motivo: "Moradores reportaram alagamento acontecendo agora.",
        contexto,
      });
      await createAdminClient().from("alertas").insert({
        bairro_id: bairroId,
        nivel: "critico",
        origem: "chamado",
        chamado_id: chamado.id,
        titulo: texto.titulo,
        mensagem: texto.mensagem,
        gerado_por: texto.gerado_por,
      });
    } catch {
      // já existe alerta crítico ativo no bairro ou falta a chave secreta: o chamado segue valendo
    }
  }

  revalidatePath("/chamados");
  revalidatePath("/");
  redirect(`/chamados/${chamado.id}?novo=1`);
}
