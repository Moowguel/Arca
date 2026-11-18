/**
 * ARCA — avaliação da IA (antes × depois).
 *
 * 1) Texto (sempre roda, sem internet): 30 relatos com a categoria correta (gabarito).
 *    ANTES  = o tipo que o próprio cidadão marcou no formulário (triagem manual de hoje)
 *    DEPOIS = a categoria dada pela IA no modo por regras
 *
 * 2) Foto (opcional, --gemini): as 13 fotos rotuladas de demonstração (Wikimedia Commons)
 *    classificadas pelo Gemini só pela imagem. Precisa de GEMINI_API_KEY no .env.local.
 *
 * Uso:  bun run avaliar-ia            (só texto)
 *       bun run avaliar-ia --gemini   (texto + fotos)
 */
import { classificarPorRegras } from "@/lib/ia/regras";
import { CATEGORIAS_IA, type CategoriaIA, type TipoInformado } from "@/lib/ia/tipos";
import casos from "./casos.json";

type Caso = { descricao: string; tipo_informado: TipoInformado; esperado: CategoriaIA };

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
// "outro" no formulário equivale a não saber classificar
const tipoComoCategoria = (t: TipoInformado): CategoriaIA => (t === "outro" ? "sem_risco" : t);

function tabelaPorCategoria(linhas: { esperado: CategoriaIA; antes?: CategoriaIA; depois: CategoriaIA }[]) {
  console.log("\n  categoria            casos   antes   depois");
  for (const cat of CATEGORIAS_IA) {
    const doTipo = linhas.filter((l) => l.esperado === cat);
    if (!doTipo.length) continue;
    const antes = doTipo.filter((l) => l.antes === cat).length;
    const depois = doTipo.filter((l) => l.depois === cat).length;
    console.log(
      `  ${cat.padEnd(20)} ${String(doTipo.length).padStart(5)}   ${
        doTipo[0].antes === undefined ? "  -  " : pct(antes, doTipo.length).padStart(6)
      }  ${pct(depois, doTipo.length).padStart(6)}`,
    );
  }
}

function avaliarTexto() {
  const lista = casos as Caso[];
  const inicio = performance.now();
  const linhas = lista.map((c) => ({
    ...c,
    antes: tipoComoCategoria(c.tipo_informado),
    depois: classificarPorRegras(c.descricao, c.tipo_informado).categoria,
  }));
  const ms = (performance.now() - inicio) / lista.length;

  const acertoAntes = linhas.filter((l) => l.antes === l.esperado).length;
  const acertoDepois = linhas.filter((l) => l.depois === l.esperado).length;

  console.log("=== 1) Triagem por texto ===");
  console.log(`casos: ${lista.length}`);
  console.log(`ANTES  (tipo marcado pelo cidadão): ${acertoAntes}/${lista.length} = ${pct(acertoAntes, lista.length)}`);
  console.log(`DEPOIS (IA, modo regras):            ${acertoDepois}/${lista.length} = ${pct(acertoDepois, lista.length)}`);
  console.log(`tempo médio da IA por chamado: ${ms.toFixed(3)} ms`);
  tabelaPorCategoria(linhas);

  const erros = linhas.filter((l) => l.depois !== l.esperado);
  if (erros.length) {
    console.log("\n  erros da IA:");
    for (const e of erros) console.log(`  - "${e.descricao}" → ${e.depois} (esperado ${e.esperado})`);
  }
}

// as mesmas fotos da migração 20261114170000_fotos_demonstracao.sql
const FOTOS: [CategoriaIA, string][] = [
  ["alagamento_ativo", "Enchente Blumenau 2008 Rua Amazonas.jpg"],
  ["alagamento_ativo", "Enchentes RS - 2024.jpg"],
  ["alagamento_ativo", "Rua alagada no Centro Histórico de Paraty RJ.jpg"],
  ["alagamento_ativo", "Enchente Vila Guilherme.jpg"],
  ["bueiro_obstruido", "Litter in a stormwater drain in Wellington.jpg"],
  ["bueiro_obstruido", "Storm drain grate in Seminole, Florida.jpg"],
  ["bueiro_obstruido", "Storm Drain.JPG"],
  ["lixo_acumulado", "Lixo na rua.jpg"],
  ["lixo_acumulado", "Basura acumulada en via publica.jpg"],
  ["lixo_acumulado", "Terreno Abandonado.jpg"],
  ["corrego_assoreado", "Córrego em favela (17279725116).jpg"],
  ["corrego_assoreado", "1078Garbage-plastic pollution in Marilao River 07.jpg"],
  ["corrego_assoreado", "POLLUTED WATER.jpg"],
];

async function avaliarFotos() {
  const { classificarComGemini, geminiConfigurado } = await import("@/lib/ia/gemini");
  console.log("\n=== 2) Triagem por foto (Gemini) ===");
  if (!geminiConfigurado()) return console.log("GEMINI_API_KEY ausente: etapa pulada.");

  const linhas: { esperado: CategoriaIA; depois: CategoriaIA }[] = [];
  const tempos: number[] = [];
  for (const [esperado, arquivo] of FOTOS) {
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo.replaceAll(" ", "_"))}?width=900`;
    try {
      const img = await fetch(url, { headers: { "user-agent": "arca-avaliacao/1.0" } });
      if (!img.ok) throw new Error(`foto ${img.status}`);
      const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
      const mimeType = img.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      const t0 = performance.now();
      // descrição neutra: o Gemini decide só pela imagem
      const r = await classificarComGemini({ base64, mimeType }, "Foto enviada pelo morador.", "outro");
      tempos.push(performance.now() - t0);
      linhas.push({ esperado, depois: r.categoria });
      console.log(`  ${r.categoria === esperado ? "✓" : "✗"} ${arquivo} → ${r.categoria} (${Math.round(r.confianca * 100)}%)`);
    } catch (e) {
      console.log(`  ! ${arquivo}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
    }
  }
  if (!linhas.length) return;
  const acertos = linhas.filter((l) => l.depois === l.esperado).length;
  const regrasSemTexto = classificarPorRegras("Foto enviada pelo morador.", "outro").categoria;
  console.log(`\nANTES  (modo regras, só tem a foto e nenhum texto útil): sempre "${regrasSemTexto}" = 0%`);
  console.log(`DEPOIS (Gemini vendo a foto): ${acertos}/${linhas.length} = ${pct(acertos, linhas.length)}`);
  console.log(`tempo médio por foto: ${(tempos.reduce((a, b) => a + b, 0) / tempos.length / 1000).toFixed(1)} s`);
  tabelaPorCategoria(linhas);
}

avaliarTexto();
if (process.argv.includes("--gemini")) await avaliarFotos();
