import "server-only";
import { classificarComGemini, escreverAlertaComGemini, geminiConfigurado } from "./gemini";
import { classificarPorRegras } from "./regras";
import { calcularPrioridade } from "./prioridade";
import type { Classificacao, ContextoBairro, TipoInformado } from "./tipos";

/**
 * Orquestra a triagem: tenta o Gemini com a foto; se não houver chave,
 * foto ou a API falhar, usa o modo reserva por regras. Mede o tempo gasto.
 */
export async function triarChamado(entrada: {
  descricao: string;
  tipoInformado: TipoInformado;
  foto: { base64: string; mimeType: string } | null;
  contexto: ContextoBairro;
}) {
  const inicio = performance.now();
  let classificacao: Classificacao;
  let falhaGemini: string | null = null;

  if (geminiConfigurado() && entrada.foto) {
    try {
      classificacao = await classificarComGemini(entrada.foto, entrada.descricao, entrada.tipoInformado);
    } catch (e) {
      falhaGemini = e instanceof Error ? e.message : String(e);
      classificacao = classificarPorRegras(entrada.descricao, entrada.tipoInformado);
    }
  } else {
    classificacao = classificarPorRegras(entrada.descricao, entrada.tipoInformado);
  }

  const prioridade = calcularPrioridade(classificacao, entrada.contexto);
  return {
    classificacao,
    prioridade,
    detalhes: {
      modelo: classificacao.modelo,
      gravidade: classificacao.gravidade,
      tempo_triagem_ms: Math.round(performance.now() - inicio),
      componentes: prioridade.componentes,
      contexto_bairro: entrada.contexto,
      falha_gemini: falhaGemini,
    },
  };
}

/** Texto do alerta: agente Gemini se disponível, senão modelo pronto */
export async function redigirAlerta(dados: {
  bairro: string;
  nivel: "atencao" | "critico";
  motivo: string;
  contexto: ContextoBairro;
}): Promise<{ titulo: string; mensagem: string; gerado_por: "gemini" | "modelo" }> {
  if (geminiConfigurado()) {
    try {
      return { ...(await escreverAlertaComGemini(dados)), gerado_por: "gemini" };
    } catch {
      // segue para o modelo pronto
    }
  }
  return dados.nivel === "critico"
    ? {
        titulo: `Risco de alagamento agora em ${dados.bairro}`,
        mensagem: `${dados.motivo} Evite sair, fique longe de córregos e bueiros e procure um local alto se a água subir. Emergência: ligue 199.`,
        gerado_por: "modelo",
      }
    : {
        titulo: `Atenção: risco de alagamento em ${dados.bairro}`,
        mensagem: `${dados.motivo} Evite áreas baixas e não atravesse ruas alagadas.`,
        gerado_por: "modelo",
      };
}
