import "server-only";
import { CATEGORIAS_IA, type Classificacao, type ContextoBairro, type TipoInformado } from "./tipos";

const MODELO = process.env.GEMINI_MODEL || "gemini-flash-latest";
const URL_API = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

export const geminiConfigurado = () => Boolean(process.env.GEMINI_API_KEY);

async function chamarGemini(partes: unknown[], schema: unknown) {
  const resposta = await fetch(URL_API(MODELO), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: partes }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resposta.ok) throw new Error(`Gemini respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
  const json = await resposta.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error("Gemini não retornou conteúdo");
  return JSON.parse(texto);
}

// ---------------------------------------------------------------------
// Prompt 1 — triagem da foto (documentado em ia/prompts.md)
// ---------------------------------------------------------------------
export const PROMPT_TRIAGEM = `Você é o assistente de triagem do ARCA, um serviço de zeladoria que previne enchentes em bairros de São Paulo.
Analise a FOTO enviada por um morador e a descrição dele. Classifique o problema visível em UMA categoria:
- bueiro_obstruido: boca de lobo, grade ou bueiro tampado por folhas, terra ou lixo
- lixo_acumulado: lixo, entulho ou descarte irregular que pode ser arrastado para a drenagem
- corrego_assoreado: córrego ou canal com terra, mato ou resíduos reduzindo a vazão
- alagamento_ativo: rua, calçada ou imóvel com água acumulada AGORA
- sem_risco: a foto não mostra nenhum risco de alagamento (ou não é uma foto do problema)
Regras:
- Baseie-se principalmente na FOTO; use a descrição só para desempatar.
- "gravidade" vai de 0 (irrelevante) a 10 (perigo imediato a pessoas ou casas).
- "confianca" vai de 0 a 1 e deve ser baixa se a foto estiver escura, borrada ou ambígua.
- "justificativa": uma frase curta em português simples dizendo o que você viu na foto.
- Não identifique pessoas, placas de carro ou endereços na justificativa.`;

const SCHEMA_TRIAGEM = {
  type: "OBJECT",
  properties: {
    categoria: { type: "STRING", enum: [...CATEGORIAS_IA] },
    confianca: { type: "NUMBER" },
    gravidade: { type: "INTEGER" },
    justificativa: { type: "STRING" },
  },
  required: ["categoria", "confianca", "gravidade", "justificativa"],
};

export async function classificarComGemini(
  foto: { base64: string; mimeType: string },
  descricao: string,
  tipoInformado: TipoInformado,
): Promise<Classificacao> {
  const r = await chamarGemini(
    [
      { text: PROMPT_TRIAGEM },
      { text: `Tipo marcado pelo morador: ${tipoInformado}\nDescrição do morador: """${descricao.slice(0, 600)}"""` },
      { inlineData: { mimeType: foto.mimeType, data: foto.base64 } },
    ],
    SCHEMA_TRIAGEM,
  );

  if (!CATEGORIAS_IA.includes(r.categoria)) throw new Error("Categoria inválida do Gemini");
  return {
    categoria: r.categoria,
    confianca: Math.min(1, Math.max(0, Number(r.confianca) || 0)),
    gravidade: Math.min(10, Math.max(0, Math.round(Number(r.gravidade) || 0))),
    justificativa: String(r.justificativa ?? "").slice(0, 300),
    modo: "gemini",
    modelo: MODELO,
  };
}

// ---------------------------------------------------------------------
// Prompt 2 — agente que escreve o alerta para a população
// ---------------------------------------------------------------------
export const PROMPT_ALERTA = `Você escreve alertas de enchente para moradores pelo app ARCA.
Escreva em português simples, frases curtas, sem termos técnicos e sem alarmismo.
O título tem no máximo 60 caracteres e cita o bairro.
A mensagem tem no máximo 280 caracteres e diz: o que está acontecendo, o que fazer agora (1 ou 2 ações concretas) e o que evitar.
Se o nível for "critico", inclua a orientação de procurar um local alto e ligar 199 (Defesa Civil) em emergência.`;

const SCHEMA_ALERTA = {
  type: "OBJECT",
  properties: { titulo: { type: "STRING" }, mensagem: { type: "STRING" } },
  required: ["titulo", "mensagem"],
};

export async function escreverAlertaComGemini(dados: {
  bairro: string;
  nivel: "atencao" | "critico";
  motivo: string;
  contexto: ContextoBairro;
}) {
  const r = await chamarGemini(
    [
      { text: PROMPT_ALERTA },
      {
        text: JSON.stringify({
          bairro: dados.bairro,
          nivel: dados.nivel,
          motivo: dados.motivo,
          nivel_do_corrego_cm: dados.contexto.nivel_cm,
          chuva_mm_por_hora: dados.contexto.chuva_mm_h,
          chamados_abertos_no_bairro: dados.contexto.chamados_abertos,
        }),
      },
    ],
    SCHEMA_ALERTA,
  );
  return { titulo: String(r.titulo).slice(0, 80), mensagem: String(r.mensagem).slice(0, 400) };
}
