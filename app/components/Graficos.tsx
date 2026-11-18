// Gráficos em SVG puro, renderizados no servidor (leves no celular).
// Uma série por gráfico, eixo único, grade discreta, valor exato no toque/hover via <title>.

const COR_SERIE = "#0564b6"; // arca-azul
const COR_AREA = "#05b2e2"; // arca-ciano
const TINTA = "#475569"; // slate-600
const GRADE = "#e2e8f0"; // slate-200

type Ponto = { x: string; y: number }; // x = ISO
type Limite = { valor: number; rotulo: string; cor: string };

function horaCurta(iso: string, comDia: boolean) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(comDia ? { day: "2-digit", month: "2-digit" } : { hour: "2-digit", minute: "2-digit" }),
  });
}

function escalaBonita(max: number) {
  const passo = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  const topo = Math.ceil(max / passo) * passo;
  return { topo, ticks: [0, topo / 4, topo / 2, (3 * topo) / 4, topo] };
}

export function GraficoLinha({
  pontos,
  unidade,
  limites = [],
  titulo,
}: {
  pontos: Ponto[];
  unidade: string;
  limites?: Limite[];
  titulo: string;
}) {
  if (pontos.length < 2) return <SemDados />;
  const L = 600, A = 220, m = { e: 40, d: 12, t: 12, b: 26 };
  const larg = L - m.e - m.d, alt = A - m.t - m.b;
  const xs = pontos.map((p) => new Date(p.x).getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const { topo, ticks } = escalaBonita(Math.max(...pontos.map((p) => p.y), ...limites.map((l) => l.valor)) * 1.05);
  const px = (t: number) => m.e + ((t - x0) / (x1 - x0 || 1)) * larg;
  const py = (v: number) => m.t + alt - (v / topo) * alt;
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${px(xs[i]).toFixed(1)},${py(p.y).toFixed(1)}`).join("");
  const area = `${caminho}L${px(x1)},${py(0)}L${px(x0)},${py(0)}Z`;
  const variosDias = x1 - x0 > 36 * 36e5;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + f * (x1 - x0));
  const passo = Math.max(1, Math.floor(pontos.length / 60)); // alvos de toque sem poluir

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.e} x2={L - m.d} y1={py(t)} y2={py(t)} stroke={GRADE} strokeWidth={1} />
          <text x={m.e - 6} y={py(t) + 4} textAnchor="end" fontSize={11} fill={TINTA}>{t}</text>
        </g>
      ))}
      {marcas.map((t) => (
        <text key={t} x={px(t)} y={A - 6} textAnchor="middle" fontSize={11} fill={TINTA}>
          {horaCurta(new Date(t).toISOString(), variosDias)}
        </text>
      ))}
      {limites.map((l) => (
        <g key={l.rotulo}>
          <line x1={m.e} x2={L - m.d} y1={py(l.valor)} y2={py(l.valor)} stroke={l.cor} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={L - m.d - 2} y={py(l.valor) - 4} textAnchor="end" fontSize={11} fontWeight={600} fill={l.cor}>
            {l.rotulo} ({l.valor} {unidade})
          </text>
        </g>
      ))}
      <path d={area} fill={COR_AREA} opacity={0.12} />
      <path d={caminho} fill="none" stroke={COR_SERIE} strokeWidth={2} strokeLinejoin="round" />
      {pontos.map((p, i) =>
        i % passo === 0 || i === pontos.length - 1 ? (
          <g key={p.x}>
            <circle cx={px(xs[i])} cy={py(p.y)} r={9} fill="transparent">
              <title>{`${horaCurta(p.x, true)} ${horaCurta(p.x, false)} — ${p.y} ${unidade}`}</title>
            </circle>
          </g>
        ) : null,
      )}
      <circle cx={px(xs.at(-1)!)} cy={py(pontos.at(-1)!.y)} r={4} fill={COR_SERIE} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

/** Barras horizontais (categorias) — bom para nomes longos no celular */
export function GraficoBarrasH({ itens, unidade }: { itens: { rotulo: string; valor: number }[]; unidade: string }) {
  if (!itens.length) return <SemDados />;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.rotulo} title={`${i.rotulo}: ${i.valor} ${unidade}`}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-700">{i.rotulo}</span>
            <span className="font-semibold text-slate-900">{i.valor}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-arca-azul" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colunas verticais por dia/hora */
export function GraficoColunas({ itens, unidade, titulo }: { itens: { rotulo: string; valor: number; dica?: string }[]; unidade: string; titulo: string }) {
  if (!itens.length) return <SemDados />;
  const L = 600, A = 200, m = { e: 34, d: 8, t: 10, b: 24 };
  const larg = L - m.e - m.d, alt = A - m.t - m.b;
  const { topo, ticks } = escalaBonita(Math.max(...itens.map((i) => i.valor), 1));
  const banda = larg / itens.length, barra = Math.max(2, Math.min(28, banda - 2));
  const py = (v: number) => m.t + alt - (v / topo) * alt;
  const cadaRotulo = Math.ceil(itens.length / 8);

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.e} x2={L - m.d} y1={py(t)} y2={py(t)} stroke={GRADE} strokeWidth={1} />
          <text x={m.e - 6} y={py(t) + 4} textAnchor="end" fontSize={11} fill={TINTA}>{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {itens.map((i, k) => {
        const x = m.e + k * banda + (banda - barra) / 2;
        const h = Math.max(0, py(0) - py(i.valor));
        return (
          <g key={k}>
            <rect x={x} y={py(i.valor)} width={barra} height={h} rx={Math.min(4, barra / 2)} fill={COR_SERIE} />
            <rect x={m.e + k * banda} y={m.t} width={banda} height={alt} fill="transparent">
              <title>{`${i.dica ?? i.rotulo}: ${i.valor} ${unidade}`}</title>
            </rect>
            {k % cadaRotulo === 0 && (
              <text x={x + barra / 2} y={A - 6} textAnchor="middle" fontSize={11} fill={TINTA}>{i.rotulo}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SemDados() {
  return <p className="py-8 text-center text-sm text-slate-500">Sem dados para os filtros escolhidos.</p>;
}
