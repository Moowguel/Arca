# ARCA — prompts, agentes e regras de automação

A IA do ARCA faz duas tarefas. As duas usam o **Gemini** (`gemini-flash-latest`, trocável por `GEMINI_MODEL`) com
**saída JSON validada por schema** e `temperature: 0.2`. Se não houver chave, se não houver foto ou se a API falhar,
o app usa o **modo reserva por regras** e nunca para de triar.

| Tarefa | Onde está | Entrada | Saída |
|---|---|---|---|
| 1. Triagem do chamado | `lib/ia/gemini.ts` → `classificarComGemini` | foto + descrição + tipo marcado | categoria, confiança, gravidade, justificativa |
| 2. Agente de alerta | `lib/ia/gemini.ts` → `escreverAlertaComGemini` | bairro, nível, motivo, leituras dos sensores | título + mensagem para a população |
| Reserva da tarefa 1 | `lib/ia/regras.ts` | descrição + tipo marcado | mesma saída da tarefa 1 |
| Prioridade | `lib/ia/prioridade.ts` | resultado da triagem + situação do bairro | score 0–100 explicado |
| Orquestração | `lib/ia/triagem.ts` | — | escolhe Gemini ou regras e mede o tempo |

---

## Prompt 1 — triagem da foto

```text
Você é o assistente de triagem do ARCA, um serviço de zeladoria que previne enchentes em bairros de São Paulo.
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
- Não identifique pessoas, placas de carro ou endereços na justificativa.
```

Depois do prompt vão a descrição do morador (cortada em 600 caracteres, entre aspas triplas para não ser lida como
instrução) e a foto em base64.

**Schema da resposta**

```json
{
  "categoria": "bueiro_obstruido | lixo_acumulado | corrego_assoreado | alagamento_ativo | sem_risco",
  "confianca": 0.0,
  "gravidade": 0,
  "justificativa": "texto"
}
```

**Proteções no código:** a categoria precisa estar na lista, senão a resposta é descartada e o modo reserva assume.
A confiança é limitada a 0–1, a gravidade a 0–10 e a justificativa a 300 caracteres. A chamada tem tempo máximo de 20 s.

**Exemplo ilustrativo** (formato real; os valores variam a cada foto)

- Entrada: foto de uma boca de lobo coberta de folhas + "o bueiro da esquina está entupido" + tipo `bueiro_obstruido`
- Saída: `{"categoria":"bueiro_obstruido","confianca":0.92,"gravidade":6,"justificativa":"Boca de lobo com a grade coberta de folhas e terra, impedindo a passagem da água."}`

---

## Prompt 2 — agente que escreve o alerta

```text
Você escreve alertas de enchente para moradores pelo app ARCA.
Escreva em português simples, frases curtas, sem termos técnicos e sem alarmismo.
O título tem no máximo 60 caracteres e cita o bairro.
A mensagem tem no máximo 280 caracteres e diz: o que está acontecendo, o que fazer agora (1 ou 2 ações concretas) e o que evitar.
Se o nível for "critico", inclua a orientação de procurar um local alto e ligar 199 (Defesa Civil) em emergência.
```

Entrada (JSON): `bairro`, `nivel` (`atencao` | `critico`), `motivo`, `nivel_do_corrego_cm`, `chuva_mm_por_hora`,
`chamados_abertos_no_bairro`. Saída: `{"titulo": "...", "mensagem": "..."}`.

**Quando o agente é acionado (automação):**

1. **Sensor** — `POST /api/sensores` recebe uma leitura acima do limite de atenção ou crítico do sensor.
   Se o bairro ainda não tem alerta ativo daquele nível, o agente escreve e o alerta é publicado (`origem = sensor`).
2. **Chamado** — a IA classifica um chamado como `alagamento_ativo` com prioridade `critica`
   (`app/chamados/actions.ts`). O alerta é publicado com `origem = chamado`.
3. **Gestor** — no painel, o gestor escolhe bairro, nível e motivo; o agente escreve o texto e o alerta é publicado (`app/gestor/actions.ts`).

Sem Gemini, o texto vem de um modelo pronto com as mesmas orientações (`redigirAlerta` em `lib/ia/triagem.ts`).
O banco garante no máximo um alerta ativo por bairro e nível, o que evita spam a cada leitura.

---

## Modo reserva — regras sobre o texto

`lib/ia/regras.ts`. O texto é normalizado (minúsculas, sem acentos) e cada categoria soma 1 ponto por palavra-chave
encontrada no início de uma palavra, por exemplo `bueiro`, `boca de lobo`, `entupid` → bueiro; `alagad`, `enchente`, `inunda` → alagamento.

- O tipo marcado pelo cidadão soma +1,5 na categoria dele.
- Vence a categoria com mais pontos. Sem nenhum indício, o resultado é `sem_risco` com confiança 0,4.
- Gravidade = base da categoria (alagamento 7, córrego 5, bueiro 4, lixo 3) + até 3 sinais de urgência
  (`urgente`, `subindo`, `criança`, `idoso`, `casa`...).
- Confiança = proporção dos pontos na categoria vencedora, limitada a 0,9.

---

## Score de prioridade (0–100)

`lib/ia/prioridade.ts`. Cada parcela aparece para o gestor com a explicação.

| Componente | Pontos |
|---|---|
| Tipo do problema | peso da categoria (alagamento 40, córrego 28, bueiro 24, lixo 18, sem risco 3) × (0,6 + 0,4 × confiança) |
| Gravidade vista na foto | gravidade × 2 (até 20) |
| Risco atual do bairro | índice de risco dos sensores (camada gold) × 0,25 (até 25) |
| Chamados abertos no bairro | 2 por chamado, até 10 |
| Chovendo agora | +5 se o pluviômetro marca ≥ 15 mm/h (exceto córrego e sem risco) |

Faixas: **crítica** ≥ 75 · **alta** ≥ 55 · **média** ≥ 30 · **baixa** < 30.

---

## Medição (antes × depois)

`bun run avaliar-ia` roda 30 relatos rotulados (`ia/avaliacao/casos.json`):

| | Acerto da categoria |
|---|---|
| Antes: tipo marcado pelo próprio cidadão | 16/30 = **53,3%** |
| Depois: IA no modo regras | 27/30 = **90,0%** |

A medição achou um erro: a palavra-chave `rio` casava dentro de "horá**rio**" e classificava "horário da coleta"
como córrego. As palavras-chave passaram a valer só no início de uma palavra (teste CT15) e o acerto subiu de
86,7% para 90,0%.

O tempo médio da IA por chamado no modo regras é menor que 1 ms. Com `--gemini`, o script também classifica as
13 fotos rotuladas de demonstração e mede o acerto e o tempo do Gemini.
