import { COR_NIVEL, COR_STATUS } from "@/lib/rotulos";

/** Etiqueta colorida para risco, prioridade ou status */
export function Selo({
  valor,
  texto,
  tipo = "nivel",
}: {
  valor: string;
  texto: string;
  tipo?: "nivel" | "status";
}) {
  const cor = (tipo === "status" ? COR_STATUS : COR_NIVEL)[valor] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cor}`}>
      {texto}
    </span>
  );
}
