import { useLayoutEffect, useRef } from "react";

// ============================================================
// Velocímetro de ritmo (mesmo desenho do Gerencial, aba Setores).
// Ponteiro = peças feitas ÷ peças esperadas até agora.
// Vermelho abaixo de 90% · amarelo 90 a 99% · verde 100% ou mais.
// O ponteiro e o número andam suavemente até o valor novo.
// ============================================================

const MAX = 150;
const W = 220;
const CX = 110;
const CY = 112;
const R = 82;

function reduzMovimento() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** anima de onde estava até o valor novo (na 1ª vez sai do zero) */
function useAnimado(valor: number, aplicar: (v: number) => void) {
  const ultimo = useRef<number | null>(null);
  useLayoutEffect(() => {
    const de = ultimo.current ?? 0;
    ultimo.current = valor;
    if (reduzMovimento() || de === valor) {
      aplicar(valor);
      return;
    }
    const D = 1200;
    let t0: number | null = null;
    let raf = 0;
    aplicar(de);
    const passo = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.max(0, Math.min(1, (t - t0) / D));
      aplicar(de + (valor - de) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    const fim = setTimeout(() => aplicar(valor), D + 150); // valor exato mesmo com a aba em segundo plano
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fim);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
}

const ang = (t: number) => ((210 - 240 * t) * Math.PI) / 180;
const P = (t: number, r = R) => [CX + r * Math.cos(ang(t)), CY - r * Math.sin(ang(t))];
const arc = (t0: number, t1: number) => {
  const [x0, y0] = P(t0);
  const [x1, y1] = P(t1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)}A${R},${R} 0 ${(t1 - t0) * 240 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
};

export function corDoRitmo(pct: number | null) {
  if (pct == null) return "var(--muted-foreground)";
  return pct >= 100 ? "var(--success)" : pct >= 90 ? "var(--warning)" : "var(--destructive)";
}

export function Velocimetro({ pct, legenda }: { pct: number | null; legenda: string }) {
  const ativo = pct != null;
  const agulha = useRef<SVGGElement>(null);
  const numero = useRef<SVGTSpanElement>(null);
  const t = ativo ? Math.min(Math.max(pct, 0), MAX) / MAX : 0;

  useAnimado(240 * t, (deg) => agulha.current?.setAttribute("transform", `rotate(${deg} ${CX} ${CY})`));
  useAnimado(ativo ? pct : 0, (x) => {
    if (numero.current) numero.current.textContent = `${Math.round(x)}%`;
  });

  const zona = (p0: number, p1: number, cor: string) => (
    <path d={arc(p0 / MAX, p1 / MAX)} fill="none" stroke={ativo ? cor : "var(--border)"} strokeWidth={13} opacity={ativo ? 0.9 : 1} />
  );
  const [nx, ny] = P(0, R - 6);
  const perp = ang(0) + Math.PI / 2;

  return (
    <svg
      viewBox={`0 0 ${W} 186`}
      className="mx-auto block w-full max-w-[240px]"
      role="img"
      aria-label={ativo ? `${Math.round(pct)}% ${legenda}` : legenda}
    >
      <path d={arc(0, 1)} fill="none" stroke="var(--muted)" strokeWidth={13} />
      {zona(0, 90, "var(--destructive)")}
      {zona(90, 100, "var(--warning)")}
      {zona(100, MAX, "var(--success)")}
      {[0, 50, 100, 150].map((v) => {
        const [x0, y0] = P(v / MAX, R - 11);
        const [x1, y1] = P(v / MAX, R + 8);
        const [tx, ty] = P(v / MAX, R - 24);
        return (
          <g key={v}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--muted-foreground)" strokeWidth={v === 100 ? 2.4 : 1.2} />
            <text x={tx} y={ty + 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">{v}</text>
          </g>
        );
      })}
      {ativo && (
        <>
          <g ref={agulha} transform={`rotate(${240 * t} ${CX} ${CY})`}>
            <path
              d={`M${CX + 6 * Math.cos(perp)},${CY - 6 * Math.sin(perp)}L${nx},${ny}L${CX - 6 * Math.cos(perp)},${CY + 6 * Math.sin(perp)}Z`}
              fill="var(--foreground)"
            />
          </g>
          <circle cx={CX} cy={CY} r={9} fill="var(--foreground)" />
          <circle cx={CX} cy={CY} r={3.5} fill="var(--card)" />
        </>
      )}
      <text x={CX} y={CY + 52} textAnchor="middle" fontWeight={800} fontSize={30} fill={corDoRitmo(pct)}>
        {ativo ? <tspan ref={numero}>{`${Math.round(pct)}%`}</tspan> : "-"}
      </text>
      <text x={CX} y={CY + 68} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{legenda}</text>
    </svg>
  );
}
