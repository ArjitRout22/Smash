/**
 * PerformanceChart — a dependency-free inline SVG "form curve": the player's
 * cumulative wins-minus-losses over their match sequence. Trends up on a win,
 * down on a loss, so a glance shows momentum. Pure (no hooks / no "use client"),
 * so it renders on both the server public profile and the client in-app profile.
 *
 * `results` is newest-first (as both profiles produce it); it's reversed here so
 * the x-axis runs oldest → newest.
 */
export function PerformanceChart({
  results,
  className,
}: {
  results: { won: boolean }[];
  className?: string;
}) {
  const chrono = [...results].reverse();
  if (chrono.length < 2) {
    return (
      <p className={`text-sm text-muted ${className ?? ""}`}>
        Play at least two matches to see your performance trend.
      </p>
    );
  }

  // Cumulative net wins after each match, seeded at 0.
  const series: number[] = [0];
  let acc = 0;
  for (const r of chrono) {
    acc += r.won ? 1 : -1;
    series.push(acc);
  }

  const W = 640;
  const H = 200;
  const padX = 12;
  const padY = 16;
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const span = Math.max(1, max - min);
  const n = series.length - 1;

  const x = (i: number) => padX + (i / n) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const zeroY = y(0);

  const linePts = series.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = `${x(0)},${zeroY} ${linePts} ${x(n)},${zeroY}`;

  const last = series[series.length - 1];
  const trendUp = last >= 0;
  const stroke = trendUp ? "var(--primary)" : "var(--danger)";

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Performance trend: net ${last >= 0 ? "+" : ""}${last} over ${n} matches`}
      >
        <defs>
          <linearGradient id="perffill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero baseline */}
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Area + line */}
        <polygon points={areaPts} fill="url(#perffill)" />
        <polyline points={linePts} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Per-match dots (skip the seed point) */}
        {chrono.map((r, i) => (
          <circle
            key={i}
            cx={x(i + 1)}
            cy={y(series[i + 1])}
            r="3.5"
            fill={r.won ? "var(--primary)" : "var(--danger)"}
          />
        ))}
      </svg>
      <p className="mt-2 text-xs text-muted">
        Net {last >= 0 ? "+" : ""}{last} over {n} matches · trending {trendUp ? "up ↗" : "down ↘"}
      </p>
    </div>
  );
}
