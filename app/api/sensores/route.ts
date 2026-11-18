import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { redigirAlerta } from "@/lib/ia/triagem";

/**
 * Entrada dos sensores IoT (simulador, Wokwi ou dispositivo real).
 *
 * POST /api/sensores
 *   cabeçalho  x-chave-dispositivo: <CHAVE_DISPOSITIVO>
 *   cabeçalho  x-origem: simulador | wokwi   (opcional)
 *   corpo      { "sensor_id": "NIV-01", "valor": 182.5, "medida_em": "2026-11-17T12:00:00Z" }
 *              ou uma lista desses objetos (até 50)
 *
 * Cada leitura passa pelo pipeline do banco (bronze → silver) em `ingerir_leitura`.
 * Leitura em atenção/crítico abre um alerta automático para o bairro, se ainda não houver um ativo.
 */

const ORIGENS = ["simulador", "wokwi"];
const MAX_LEITURAS = 50;

function chaveValida(recebida: string | null) {
  const esperada = process.env.CHAVE_DISPOSITIVO;
  if (!esperada || !recebida) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Resultado = {
  ok: boolean;
  erro?: string;
  sensor_id?: string;
  bairro_id?: number;
  tipo?: "nivel" | "chuva";
  valor?: number;
  nivel_risco?: "normal" | "atencao" | "critico";
};

export async function POST(request: Request) {
  if (!process.env.CHAVE_DISPOSITIVO) {
    return Response.json({ erro: "CHAVE_DISPOSITIVO não configurada no servidor" }, { status: 503 });
  }
  if (!chaveValida(request.headers.get("x-chave-dispositivo"))) {
    return Response.json({ erro: "chave do dispositivo inválida" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "corpo precisa ser JSON" }, { status: 400 });
  }
  const leituras = Array.isArray(corpo) ? corpo : [corpo];
  if (leituras.length === 0 || leituras.length > MAX_LEITURAS) {
    return Response.json({ erro: `envie de 1 a ${MAX_LEITURAS} leituras` }, { status: 400 });
  }
  if (!leituras.every((l) => l && typeof l === "object" && !Array.isArray(l))) {
    return Response.json({ erro: "cada leitura precisa ser um objeto" }, { status: 400 });
  }

  const origemInformada = request.headers.get("x-origem") ?? "";
  const origem = ORIGENS.includes(origemInformada) ? origemInformada : "dispositivo";
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ erro: "SUPABASE_SECRET_KEY não configurada no servidor" }, { status: 503 });
  }

  // o banco valida sensor, tipo, faixa e data; aqui só repassamos o payload
  const resultados: Resultado[] = [];
  for (const payload of leituras) {
    const { data, error } = await admin.rpc("ingerir_leitura", { p_origem: origem, p_payload: payload });
    resultados.push(error ? { ok: false, erro: "falha_no_banco" } : (data as Resultado));
  }

  // pior leitura de cada bairro nesta remessa decide o alerta
  const piorPorBairro = new Map<number, Resultado>();
  for (const r of resultados) {
    if (!r.ok || !r.bairro_id || r.nivel_risco === "normal") continue;
    const atual = piorPorBairro.get(r.bairro_id);
    if (!atual || (r.nivel_risco === "critico" && atual.nivel_risco !== "critico")) piorPorBairro.set(r.bairro_id, r);
  }

  const alertas: string[] = [];
  for (const [bairroId, r] of piorPorBairro) {
    const nivel = r.nivel_risco as "atencao" | "critico";
    const { count } = await admin
      .from("alertas")
      .select("id", { count: "exact", head: true })
      .eq("bairro_id", bairroId)
      .eq("nivel", nivel)
      .eq("ativo", true);
    if (count) continue; // já existe alerta ativo deste nível: não repete

    const { data: s } = await admin
      .from("v_situacao_bairros")
      .select("bairro, indice_risco, classificacao_risco, nivel_cm, chuva_mm_h, chamados_abertos")
      .eq("bairro_id", bairroId)
      .maybeSingle();
    if (!s) continue;

    const motivo =
      r.tipo === "nivel"
        ? `O sensor do córrego marcou ${r.valor} cm${nivel === "critico" ? ", acima do limite crítico" : ""}.`
        : `O pluviômetro marcou ${r.valor} mm/h de chuva${nivel === "critico" ? ", chuva muito forte" : ""}.`;
    const texto = await redigirAlerta({
      bairro: s.bairro,
      nivel,
      motivo,
      contexto: {
        indice_risco: s.indice_risco ?? 0,
        classificacao_risco: s.classificacao_risco ?? "baixo",
        nivel_cm: s.nivel_cm,
        chuva_mm_h: s.chuva_mm_h,
        chamados_abertos: s.chamados_abertos ?? 0,
      },
    });
    const { error } = await admin.from("alertas").insert({
      bairro_id: bairroId,
      nivel,
      origem: "sensor",
      sensor_id: r.sensor_id,
      titulo: texto.titulo,
      mensagem: texto.mensagem,
      gerado_por: texto.gerado_por,
    });
    if (!error) alertas.push(`${s.bairro}: ${nivel}`);
  }

  if (alertas.length) {
    revalidatePath("/");
    revalidatePath("/alertas");
  }

  const aceitas = resultados.filter((r) => r.ok).length;
  return Response.json(
    { recebidas: resultados.length, aceitas, rejeitadas: resultados.length - aceitas, alertas_criados: alertas, resultados },
    { status: aceitas ? 200 : 422 },
  );
}
