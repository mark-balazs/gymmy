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
 * **The x-axis is time, and every point is a session.** The first version
 * plotted one slot per calendar week, `null` for the weeks you did not train,
 * and broke the stroke wherever it found one — which meant a lift trained
 * fortnightly was drawn as a row of disconnected stubs. That was the renderer
 * being asked to paper over the wrong data shape. Feeding it the sessions that
 * actually happened, on an axis where three untrained weeks take up three
 * weeks of width, makes the line continuous by construction: there are no
 * empty buckets left to break it. A gap still has to be visible — a straight
 * segment across a month would draw progress that did not happen — so the
 * segment spanning it is dotted and carries no wash beneath it. Honest about
 * the gap, and still a line you can follow.
 */

import { useRef, useState } from 'react';
import { cn } from '@/components/ui';

export interface ChartPoint {
  /** When it happened. Drives position, so gaps are wide rather than hidden. */
  date: string;
  value: number;
  /** Shown on the axis ends, in the tooltip and in the table. Formatted by the
   *  caller, which is what keeps this component free of locales. */
  label: string;
  /** A new personal best at this point — ringed, and starred in the table. */
  peak?: boolean;
}

const W = 340;
const H = 136;
const PAD = { top: 12, right: 10, bottom: 24, left: 34 };

/** Past this, two sessions are not consecutive in any useful sense. A fortnight
 *  is one missed week for somebody training weekly and two for the rest. */
const GAP_DAYS = 14;
const DAY_MS = 86_400_000;

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

/**
 * Splits a series into stretches of genuinely consecutive sessions.
 *
 * Shared by both charts so a gap means the same thing at every size — the
 * sparkline in a list and the full chart in a sheet must not disagree about
 * whether you trained in August.
 */
function runsOf(points: ChartPoint[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && Date.parse(p.date) - Date.parse(prev.date) > GAP_DAYS * DAY_MS) {
      runs.push(run);
      run = [];
    }
    run.push(i);
  });
  if (run.length) runs.push(run);
  return runs;
}

/** Maps dates to x and values to y for a given box. */
function scales(points: ChartPoint[], box: { w: number; h: number; pad: typeof PAD }) {
  const times = points.map((p) => Date.parse(p.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  const plotW = box.w - box.pad.left - box.pad.right;
  const plotH = box.h - box.pad.top - box.pad.bottom;

  return {
    lo,
    hi,
    plotW,
    plotH,
    baseline: box.pad.top + plotH,
    x: (i: number) =>
      box.pad.left + (t1 === t0 ? plotW / 2 : ((times[i]! - t0) / (t1 - t0)) * plotW),
    y: (v: number) => box.pad.top + plotH - ((v - lo) / (hi - lo)) * plotH,
  };
}

const pathOf = (
  run: number[],
  x: (i: number) => number,
  y: (v: number) => number,
  pts: ChartPoint[],
) =>
  run.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i]!.value).toFixed(1)}`).join('');

export function LineChart({
  points,
  unit,
  label,
  tableLabel,
  labelHeader,
  valueHeader,
  tone = 'primary',
  decimals,
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
  /** Which of the app's two voices this chart speaks in. Green is work done;
   *  violet is what it measured. One hue per chart either way — a single
   *  series has no identity to encode. */
  tone?: 'primary' | 'secondary';
  /** Fixed decimal places, trailing zero kept. Unset, values round to one place
   *  and drop it — which is right for kilos and wrong for the strength index,
   *  whose one decimal is part of what tells it apart from a DOTS score. */
  decimals?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const hue = tone === 'secondary' ? 'var(--color-accent-2)' : 'var(--color-accent)';

  if (points.length < 2) return null;

  const { lo, hi, baseline, x, y } = scales(points, { w: W, h: H, pad: PAD });
  const runs = runsOf(points);

  const last = points[points.length - 1]!;
  const shown = active === null ? null : (points[active] ?? null);
  const fmt = (v: number) =>
    `${decimals === undefined ? Math.round(v * 10) / 10 : v.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;

  /** Nearest point to the pointer, in the chart's own coordinates. Scaling is
   *  read off the rendered box, so it survives the SVG being any width, and the
   *  search is over x rather than index because the spacing is not uniform. */
  const track = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const at = ((clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - at) < Math.abs(x(best) - at)) best = i;
    }
    setActive(best);
  };

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        // Dragging across this scrubs the chart; it must not also change tab.
        data-no-swipe
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

        {/* The wash is closed down to the baseline, so it reads as area rather
            than as a second, thicker line — and it stops at a gap, because
            there was no training under that stretch to shade. */}
        {runs.map((run, k) =>
          run.length > 1 ? (
            <path
              key={`a${k}`}
              d={`${pathOf(run, x, y, points)}L${x(run[run.length - 1]!).toFixed(1)},${baseline.toFixed(1)}L${x(run[0]!).toFixed(1)},${baseline.toFixed(1)}Z`}
              fill={hue}
              opacity="0.1"
            />
          ) : null,
        )}

        {/* Dotted across the gaps, drawn under the solid runs. The line carries
            on — you can follow it — but it does not claim those weeks. */}
        {runs.slice(1).map((run, k) => {
          const from = runs[k]![runs[k]!.length - 1]!;
          const to = run[0]!;
          return (
            <path
              key={`g${k}`}
              d={`M${x(from).toFixed(1)},${y(points[from]!.value).toFixed(1)}L${x(to).toFixed(1)},${y(points[to]!.value).toFixed(1)}`}
              fill="none"
              stroke={hue}
              strokeWidth="2"
              strokeDasharray="2 4"
              strokeLinecap="round"
              opacity="0.55"
            />
          );
        })}

        {runs.map((run, k) => (
          <path
            key={`l${k}`}
            d={pathOf(run, x, y, points)}
            fill="none"
            stroke={hue}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Personal bests, ringed in the surface colour so they stay legible
            where they sit on the line. */}
        {points.map((p, i) =>
          p.peak ? (
            <circle
              key={`p${i}`}
              cx={x(i)}
              cy={y(p.value)}
              r="4"
              fill={hue}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          ) : null,
        )}

        {active !== null && shown && (
          <g>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={baseline}
              stroke="var(--color-muted)"
              strokeWidth="1"
            />
            <circle
              cx={x(active)}
              cy={y(shown.value)}
              r="4.5"
              fill={hue}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* The one direct label: where the line has got to. Knocked out of
            whatever it lands on — the last point sits hard against the right
            edge, so the label has nowhere to go but back over its own line. */}
        {shown === null && (
          <text
            x={Math.min(x(points.length - 1) + 6, W - PAD.right)}
            y={Math.max(y(last.value) - 8, PAD.top + 8)}
            textAnchor="end"
            stroke="var(--color-surface)"
            strokeWidth="3"
            strokeLinejoin="round"
            paintOrder="stroke"
            className="num fill-[var(--color-ink)] text-[10px] font-semibold"
          >
            {fmt(last.value)}
          </text>
        )}

        <text x={PAD.left} y={H - 6} className="fill-[var(--color-muted)] text-[9px]">
          {points[0]!.label}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="fill-[var(--color-muted)] text-[9px]"
        >
          {last.label}
        </text>
      </svg>

      <figcaption
        className={cn(
          'num text-center text-[11px]',
          shown === null ? 'text-[var(--color-muted)]' : 'font-semibold text-[var(--color-ink)]',
        )}
      >
        {shown === null ? label : `${shown.label} · ${fmt(shown.value)}${shown.peak ? ' ★' : ''}`}
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
            {points.map((p, i) => (
              <tr key={`${p.date}-${i}`} className="border-t border-[var(--color-line)]">
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

const SPARK = { w: 92, h: 26, pad: { top: 3, right: 3, bottom: 3, left: 3 } };

/**
 * The same line, small enough to sit in a list row.
 *
 * This is what lets the page stop being fifteen identical charts stacked in a
 * column: the shape of each lift is legible at a glance and the full chart is
 * one tap away, rather than every lift demanding the same 136 pixels whether
 * or not you care about it.
 *
 * Purely decorative to a screen reader — the row it sits in already says the
 * name, the number and the verdict in words, and a second, wordless copy of
 * that would only be something else to skip past.
 */
export function Sparkline({
  points,
  tone = 'secondary',
}: {
  points: ChartPoint[];
  tone?: 'primary' | 'secondary';
}) {
  const hue = tone === 'secondary' ? 'var(--color-accent-2)' : 'var(--color-accent)';
  if (points.length < 2) return null;

  const { x, y } = scales(points, { w: SPARK.w, h: SPARK.h, pad: SPARK.pad });
  const runs = runsOf(points);
  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${SPARK.w} ${SPARK.h}`}
      aria-hidden
      className="h-[26px] w-[92px] shrink-0 overflow-visible"
    >
      {runs.slice(1).map((run, k) => {
        const from = runs[k]![runs[k]!.length - 1]!;
        return (
          <path
            key={`g${k}`}
            d={`M${x(from).toFixed(1)},${y(points[from]!.value).toFixed(1)}L${x(run[0]!).toFixed(1)},${y(points[run[0]!]!.value).toFixed(1)}`}
            fill="none"
            stroke={hue}
            strokeWidth="1.5"
            strokeDasharray="1.5 3"
            opacity="0.5"
          />
        );
      })}
      {runs.map((run, k) => (
        <path
          key={k}
          d={pathOf(run, x, y, points)}
          fill="none"
          stroke={hue}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={x(last)} cy={y(points[last]!.value)} r="2" fill={hue} />
    </svg>
  );
}
