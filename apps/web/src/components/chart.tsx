'use client';

/**
 * One line chart, drawn by hand.
 *
 * No chart library: everything here is a path and a few text nodes, which is
 * less to ship to a phone than any library's tree-shaken core and cannot go
 * stale. The specs are the boring ones that make charts readable — a 2px line,
 * a 10% wash beneath it, hairline solid gridlines one step off the surface, and
 * exactly one direct label (the latest value). A number beside every point is
 * chaos and goes unread.
 *
 * A gap in the data breaks the line rather than bridging it. A straight segment
 * across three untrained weeks would draw progress that did not happen.
 */

import { useRef, useState } from 'react';
import { cn } from '@/components/ui';

export interface ChartPoint {
  /** Shown on the x-axis and in the tooltip. */
  label: string;
  value: number | null;
  /** A new personal best at this point — ringed, and called out in the table. */
  peak?: boolean;
}

const W = 340;
const H = 136;
const PAD = { top: 12, right: 10, bottom: 24, left: 34 };

/** Clean tick values, so the axis reads 60 / 80 / 100 rather than 63.4 / 81.7. */
function ticks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step)
    out.push(Math.round(t * 100) / 100);
  return out;
}

export function LineChart({
  points,
  unit,
  label,
  tableLabel,
  labelHeader,
  valueHeader,
}: {
  points: ChartPoint[];
  /** Appended to values in labels and the tooltip. Empty for a unitless score. */
  unit: string;
  /** Describes the series for screen readers — there is one series, so there
   *  is no legend; the label does that job. */
  label: string;
  tableLabel: string;
  labelHeader: string;
  valueHeader: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const real = points.filter((p): p is ChartPoint & { value: number } => p.value !== null);
  if (real.length < 2) return null;

  const values = real.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, max * 0.05) : (max - min) * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  // Drawn as separate runs so a gap genuinely breaks the stroke.
  const runs: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push({ i, v: p.value });
  });
  if (run.length) runs.push(run);

  const line = (r: { i: number; v: number }[]) =>
    r.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  /** The wash is closed down to the baseline, so it reads as area rather than
   *  as a second, thicker line. */
  const area = (r: { i: number; v: number }[]) =>
    r.length < 2
      ? ''
      : `${line(r)}L${x(r[r.length - 1]!.i).toFixed(1)},${(PAD.top + plotH).toFixed(1)}` +
        `L${x(r[0]!.i).toFixed(1)},${(PAD.top + plotH).toFixed(1)}Z`;

  const lastIdx = points.findLastIndex((p) => p.value !== null);
  const last = points[lastIdx];
  const shown = active !== null && points[active]?.value != null ? active : null;
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`;

  /** Nearest point to the pointer, in the chart's own coordinates. Scaling is
   *  read off the rendered box, so it survives the SVG being any width. */
  const track = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const at = ((clientX - box.left) / box.width) * W;
    const i = Math.round(((at - PAD.left) / plotW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="w-full touch-pan-y overflow-visible"
        onPointerDown={(e) => track(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && track(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {ticks(lo, hi).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 5}
              y={y(t) + 3}
              textAnchor="end"
              className="num fill-[var(--color-muted)] text-[9px]"
            >
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}

        {runs.map((r, k) => (
          <path key={`a${k}`} d={area(r)} fill="var(--color-accent)" opacity="0.1" />
        ))}
        {runs.map((r, k) => (
          <path
            key={`l${k}`}
            d={line(r)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Personal bests, ringed in the surface colour so they stay legible
            where they sit on the line. */}
        {points.map((p, i) =>
          p.peak && p.value !== null ? (
            <circle
              key={`p${i}`}
              cx={x(i)}
              cy={y(p.value)}
              r="4"
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          ) : null,
        )}

        {shown !== null && points[shown]!.value !== null && (
          <g>
            <line
              x1={x(shown)}
              x2={x(shown)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--color-muted)"
              strokeWidth="1"
            />
            <circle
              cx={x(shown)}
              cy={y(points[shown]!.value!)}
              r="4.5"
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* The one direct label: where the line has got to. */}
        {last?.value != null && shown === null && (
          <text
            x={Math.min(x(lastIdx) + 6, W - PAD.right)}
            y={Math.max(y(last.value) - 6, PAD.top + 8)}
            textAnchor={lastIdx > points.length - 3 ? 'end' : 'start'}
            className="num fill-[var(--color-ink)] text-[10px] font-semibold"
          >
            {fmt(last.value)}
          </text>
        )}

        <text x={PAD.left} y={H - 6} className="fill-[var(--color-muted)] text-[9px]">
          {points[0]?.label}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="fill-[var(--color-muted)] text-[9px]"
        >
          {points[points.length - 1]?.label}
        </text>
      </svg>

      <figcaption
        className={cn(
          'num text-center text-[11px]',
          shown === null ? 'text-[var(--color-muted)]' : 'font-semibold text-[var(--color-ink)]',
        )}
      >
        {shown === null
          ? label
          : `${points[shown]!.label} · ${fmt(points[shown]!.value!)}${points[shown]!.peak ? ' ★' : ''}`}
      </figcaption>

      {/* The table is not a fallback, it is the accessible twin: every value a
          tooltip can show is readable without hovering anything. */}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-[var(--color-muted)]">{tableLabel}</summary>
        <table className="mt-1.5 w-full border-collapse">
          <thead>
            <tr className="text-left text-[var(--color-muted)]">
              <th className="py-0.5 font-medium">{labelHeader}</th>
              <th className="py-0.5 text-right font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody className="num">
            {real.map((p, i) => (
              <tr key={`${p.label}-${i}`} className="border-t border-[var(--color-line)]">
                <td className="py-0.5">{p.label}</td>
                <td className="py-0.5 text-right">
                  {fmt(p.value)}
                  {p.peak && ' ★'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
