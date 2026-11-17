/**
 * ARCA — simulador dos sensores IoT (nível do córrego + pluviômetro).
 *
 * Gera uma tempestade que começa, atinge o pico e passa. O córrego responde à
 * chuva com atraso e depois escoa — o mesmo modelo usado no seed do banco.
 * A cada passo envia 12 leituras (6 bairros × 2 sensores) para POST /api/sensores.
 *
 * Uso:  bun iot/simulador.ts [--passos 30] [--intervalo 2] [--pico 40] [--url http://localhost:3000]
 * A chave vem de CHAVE_DISPOSITIVO no .env.local (o bun carrega sozinho).
 */

export const BAIRROS = 6;
export const NIVEL_BASE = 60; // cm com o córrego em tempo seco
// quanto cada bairro "sente" a chuva (Jardim Pantanal é o mais exposto)
export const FATOR = [1.25, 1.1, 0.9, 0.85, 0.6, 0.7];

/** Chuva (mm/h) no passo `passo` de `total`: curva em sino com pico no meio. */
export function chuvaNoPasso(passo: number, total: number, pico: number) {
  const meio = total / 2;
  const largura = Math.max(total / 6, 1);
  return pico * Math.exp(-(((passo - meio) / largura) ** 2));
}

/** Novo nível do córrego: sobe com a chuva, escoa 8% do excesso por passo. Limitado a 20–480 cm. */
export function proximoNivel(nivel: number, chuva: number) {
  const novo = nivel + chuva * 0.9 - (nivel - NIVEL_BASE) * 0.08;
  return Math.min(480, Math.max(20, novo));
}

const id = (prefixo: string, bairro: number) => `${prefixo}-${String(bairro).padStart(2, "0")}`;
const arred = (n: number) => Math.round(n * 10) / 10;

function argumento(nome: string, padrao: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

async function main() {
  const passos = Number(argumento("passos", "30"));
  const intervaloMs = Number(argumento("intervalo", "2")) * 1000;
  const pico = Number(argumento("pico", "40"));
  const url = `${argumento("url", process.env.ARCA_URL ?? "http://localhost:3000")}/api/sensores`;
  const chave = process.env.CHAVE_DISPOSITIVO;
  if (!chave) {
    console.error("Defina CHAVE_DISPOSITIVO no .env.local (a mesma usada pelo servidor).");
    process.exit(1);
  }

  const niveis = Array(BAIRROS).fill(NIVEL_BASE);
  console.log(`Simulando ${passos} passos, pico de ${pico} mm/h → ${url}\n`);

  for (let passo = 0; passo < passos; passo++) {
    const chuvaBase = chuvaNoPasso(passo, passos, pico);
    const leituras = [];
    for (let b = 1; b <= BAIRROS; b++) {
      // ruído pequeno para parecer sensor de verdade
      const chuva = Math.max(0, arred(chuvaBase * FATOR[b - 1] + (Math.random() - 0.5)));
      niveis[b - 1] = proximoNivel(niveis[b - 1], chuva);
      const medida_em = new Date().toISOString();
      leituras.push({ sensor_id: id("CHU", b), valor: chuva, medida_em });
      leituras.push({ sensor_id: id("NIV", b), valor: arred(niveis[b - 1]), medida_em });
    }

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-chave-dispositivo": chave, "x-origem": "simulador" },
        body: JSON.stringify(leituras),
      });
      const json = await r.json();
      const alertas = json.alertas_criados?.length ? `  ⚠ alertas: ${json.alertas_criados.join(", ")}` : "";
      console.log(
        `passo ${String(passo + 1).padStart(2)}  chuva ${arred(chuvaBase).toString().padStart(5)} mm/h  ` +
          `nível Pantanal ${arred(niveis[0]).toString().padStart(5)} cm  [${r.status}] ` +
          `${json.aceitas ?? 0}/${json.recebidas ?? 0} aceitas${alertas}${json.erro ? `  erro: ${json.erro}` : ""}`,
      );
    } catch (e) {
      console.log(`passo ${passo + 1}: servidor fora do ar (${e instanceof Error ? e.message : e})`);
    }

    if (passo < passos - 1) await Bun.sleep(intervaloMs);
  }
}

if (import.meta.main) main();
