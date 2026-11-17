# ARCA — Alerta de Risco Climático e Apoio

> Global Solution 2026/2 · CitizenTech · FIAP Engenharia de Software (4ESOA)

**Vídeo pitch:** _[cole aqui o link público]_

## O problema e o cidadão

Moradores de bairros que alagam todo verão (Jardim Pantanal, Itaim Paulista, Vila Prudente...) veem o bueiro entupido,
o lixo na margem e o córrego subindo antes de qualquer órgão público. Mas não têm um canal simples para avisar, nem
recebem alerta a tempo de proteger a casa e a família.

**O ARCA** junta os olhos do cidadão e os sensores do córrego:

1. O morador fotografa o problema (bueiro, lixo, córrego, rua alagada) e abre um chamado em segundos.
2. A **IA** classifica a foto e calcula uma **prioridade explicável** combinando o que viu com os **sensores de nível e chuva** do bairro.
3. O **gestor** (Defesa Civil / subprefeitura) atende pela fila priorizada e acompanha tudo num **dashboard**.
4. Quando o córrego passa do limite, um **agente de IA escreve o alerta** e o ARCA avisa a população do bairro.

**ODS:** 11 (cidades e comunidades sustentáveis), 13 (ação contra a mudança do clima), 10 (redução das desigualdades:
as áreas mais afetadas são periferias) e 9 (infraestrutura).

## As 4 áreas no código

| Área | O que tem | Onde está |
|---|---|---|
| **1. IA e automação** | Triagem da foto com Gemini, modo reserva por regras, score de prioridade, agente que escreve alertas, alerta automático | `lib/ia/`, `ia/prompts.md`, `ia/avaliacao/` |
| **2. Big data e visualização** | Camadas bronze → silver → gold, ingestão com validação, visões analíticas (média móvel, LAG, ranking, índice de risco), dashboard com filtros | `supabase/migrations/`, `supabase/seed.sql`, `app/dashboard/` |
| **3. MVP, IoT e experiência digital** | 9 telas, fluxo cidadão → IA → gestor → alerta, sensores de nível e chuva (circuito Wokwi, simulador e rota de ingestão) | `app/`, `iot/`, `app/api/sensores/` |
| **4. DevOps, segurança e qualidade** | Docker multi-stage, healthcheck, CI, autenticação, RLS, validação de entrada, testes | `Dockerfile`, `docker-compose.yml`, `.github/workflows/`, `app/api/saude/`, `*.test.ts` |

**Integração entre as áreas:** os sensores alimentam a camada gold, que alimenta o dashboard **e** a IA (o índice de
risco do bairro entra no score de prioridade); leituras críticas disparam o agente de alerta.

**Tecnologias:** Next.js 16 (React 19, TypeScript), Supabase (PostgreSQL, Auth, Storage), Google Gemini, Bun, Docker,
GitHub Actions.

---

## Como rodar

### Pré-requisitos

- [Bun](https://bun.sh) 1.3+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o Supabase local e para a imagem do app)

### 1. Instalar e configurar

```bash
bun install
cp .env.example .env.local
```

### 2. Banco (Supabase local)

```bash
bunx supabase start
bunx supabase db reset
```

O `start` imprime a **API URL**, a **Publishable key** e a **Secret key**. Coloque no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Publishable key>
SUPABASE_SECRET_KEY=<Secret key>
CHAVE_DISPOSITIVO=<qualquer texto secreto, ex.: um UUID>
GEMINI_API_KEY=<opcional — sem ela a IA usa o modo reserva por regras>
```

O `db reset` cria as tabelas, as camadas bronze/silver/gold e carrega o **seed**: 6 bairros, 12 sensores, 7 dias de
leituras com três temporais e chamados de demonstração.

> Usando um projeto Supabase na nuvem: rode `bunx supabase link` e `bunx supabase db push --include-seed`, e use as
> chaves de *Project Settings → API Keys*.

### 3. App

```bash
bun run dev
```

Abra http://localhost:3000.

| Conta de demonstração | Senha | O que ver |
|---|---|---|
| `cidadao@arca.dev` | `arca1234` | abrir chamado com foto, acompanhar, ver alertas |
| `gestor@arca.dev` | `arca1234` | painel do gestor, fila priorizada, publicar alerta, dashboard |

### 4. Sensores IoT (simulador)

Com o app rodando, em outro terminal:

```bash
bun run simular
```

Simula uma tempestade nos 6 bairros: a cada 2 s envia 12 leituras (nível + chuva) para `POST /api/sensores`.
O córrego do Jardim Pantanal passa do limite crítico (220 cm) e um alerta é publicado automaticamente.
Opções: `--passos 30 --intervalo 2 --pico 40 --url http://localhost:3000`.

**Circuito no Wokwi** (`iot/wokwi/`): ESP32 com sensor ultrassônico HC-SR04 (nível do córrego), potenciômetro
(pluviômetro) e LEDs de atenção/crítico com os mesmos limites do banco. Projeto público: _[cole aqui o link do Wokwi]_

1. Em [wokwi.com](https://wokwi.com), crie um projeto **ESP32** e cole `sketch.ino` e `diagram.json` nas abas de mesmo nome.
2. Clique em ▶. A cada 5 s o monitor serial mostra o nível, a chuva e o JSON no formato de `POST /api/sensores`.
3. Clique no HC-SR04 para mudar a distância (nível = 400 cm − distância) e gire o potenciômetro para mudar a chuva.

O Wokwi online não alcança o `localhost`; para enviar de verdade, preencha `ARCA_URL` e `CHAVE` no sketch com um
endereço público do app.

### 5. Testes e avaliação da IA

```bash
bun test
bun run avaliar-ia
bun run lint
```

O `avaliar-ia --gemini` também classifica as 13 fotos rotuladas com o Gemini (precisa da `GEMINI_API_KEY`).

### 6. Docker

```bash
docker compose --env-file .env.local up --build
```

Sobe o app em http://localhost:3000 com usuário sem privilégios e healthcheck em `/api/saude`.
Dentro do container, `127.0.0.1` é o próprio container: para usar o **Supabase local**, troque a URL por
`http://host.docker.internal:54321`, ou use um projeto Supabase na nuvem.

---

## API

| Rota | Uso |
|---|---|
| `GET /api/saude` | Monitoramento: status do app, do banco e modo da IA (200 ou 503) |
| `POST /api/sensores` | Entrada dos sensores. Cabeçalho `x-chave-dispositivo`; corpo `{ "sensor_id": "NIV-01", "valor": 182.5, "medida_em": "..." }` ou uma lista (até 50) |

Exemplo:

```bash
curl -X POST http://localhost:3000/api/sensores \
  -H "content-type: application/json" -H "x-chave-dispositivo: $CHAVE_DISPOSITIVO" \
  -d '{"sensor_id":"NIV-01","valor":230}'
```

## Dados (área 2)

| Camada | Conteúdo |
|---|---|
| `bronze.leituras_brutas` | payload JSON exatamente como chegou, com origem e motivo de rejeição |
| `silver.leituras` | leitura validada, tipada e classificada (normal / atenção / crítico) |
| `gold.*` (`v_*` na API) | `leituras_por_hora` (média móvel 3h, variação), `situacao_bairros` (índice de risco 0–100 e ranking), `chamados_diario`, `indicadores_gerais`, `qualidade_ingestao` |

A função `ingerir_leitura` faz bronze → silver numa chamada: valida sensor, formato, faixa (nível 0–500 cm, chuva
0–200 mm/h) e data, e registra o erro quando rejeita.

## Segurança

- **Autenticação** com Supabase Auth e papéis `cidadao` / `gestor`; rotas protegidas no `proxy.ts`.
- **RLS** em todas as tabelas: o cidadão só vê os próprios chamados; só o gestor atualiza chamados e alertas;
  o cidadão não consegue mudar o próprio papel.
- **Validação de entrada** no servidor: tipo, tamanho da descrição, foto (JPEG/PNG/WebP até 5 MB, só na pasta do
  usuário), coordenadas; o banco tem `check` nas colunas.
- **Sensores** só escrevem com a chave do dispositivo (comparação em tempo constante); as camadas bronze/silver não
  são expostas pela API.
- **Segredos** só em tempo de execução, nunca na imagem Docker; a IA não identifica pessoas nem placas.

## Testes

`bun test` — 15 casos:

| Caso | O que verifica |
|---|---|
| CT01 | Bueiro entupido → `bueiro_obstruido` |
| CT02 | Sinais de urgência aumentam a gravidade do alagamento |
| CT03 | Texto sem risco → `sem_risco` com confiança baixa |
| CT04 | Tipo marcado pelo cidadão desempata texto vago |
| CT05 | Maiúsculas e acentos não atrapalham |
| CT06 | Confiança ≤ 0,9 e gravidade ≤ 10 |
| CT07 | Alagamento grave + bairro crítico + chuva → prioridade crítica (100) |
| CT08 | Foto sem risco em bairro calmo → prioridade baixa |
| CT09 | O mesmo bueiro vale mais num bairro com risco alto |
| CT10 | Bônus de chuva só a partir de 15 mm/h e não para córrego |
| CT11 | Chamados abertos somam no máximo 10 pontos |
| CT12 | O score é a soma dos componentes mostrados ao gestor |
| CT13 | A tempestade simulada passa do limite crítico e o córrego volta a baixar |
| CT14 | O nível simulado nunca sai da faixa aceita pelo banco |
| CT15 | Palavra-chave dentro de outra palavra não conta ("rio" em "horário") |

## Estrutura

```
app/                 telas (Next.js App Router) e rotas de API
  api/sensores/      ingestão IoT          api/saude/   monitoramento
  chamados/ gestor/ alertas/ dashboard/ perfil/ login/
lib/ia/              triagem, regras, prioridade, Gemini (+ testes)
ia/                  prompts.md e avaliacao/ (casos rotulados + script)
iot/                 simulador de sensores (+ testes) e wokwi/ (circuito ESP32)
supabase/            migrações (bronze/silver/gold, RLS) e seed
utils/supabase/      clientes do Supabase (navegador, servidor, admin)
```

## Uso de IA generativa

_[Grupo: revisar e completar.]_

| Ferramenta | Para quê |
|---|---|
| Google Gemini | Parte do produto: triagem das fotos e redação dos alertas (`ia/prompts.md`) |
| Claude Code | Apoio no desenvolvimento: rota de sensores, simulador, testes, script de avaliação e documentação. Todo o código foi revisado e testado pelo grupo |

Créditos das fotos de demonstração: `docs/creditos-imagens.md`.

## Integrantes

_Nome do grupo:_ ...

| Nome | RM |
|---|---|
| André Vigarani de Camargo | RM97630 |
| Anna Yagyu | RM550360 |
| Jean Luiz Bonilha | RM551865 |
| Miguel Lima | RM552003 |
| Murilo Favoretto Finardi | RM99950 |
