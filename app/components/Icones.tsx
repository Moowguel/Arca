// Ícones simples em SVG (traço), para não depender de biblioteca externa
type P = { className?: string };
const base = (d: React.ReactNode, className = "h-6 w-6") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {d}
  </svg>
);

export const IconeInicio = ({ className }: P) =>
  base(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>, className);
export const IconeGrafico = ({ className }: P) =>
  base(<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /></>, className);
export const IconeMais = ({ className }: P) => base(<><path d="M12 5v14" /><path d="M5 12h14" /></>, className);
export const IconeLista = ({ className }: P) =>
  base(<><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>, className);
export const IconeEscudo = ({ className }: P) =>
  base(<><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>, className);
export const IconeUsuario = ({ className }: P) =>
  base(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>, className);
export const IconeSino = ({ className }: P) =>
  base(<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>, className);
