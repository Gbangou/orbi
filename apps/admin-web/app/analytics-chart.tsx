'use client';

/**
 * Mini charts SVG sans dépendance externe — pur HTML/CSS.
 * Parfait pour le dashboard admin: zéro bundle overhead.
 *
 * Composants exposés:
 *   <SparkLine data={[...]} color="teal" label="Courses/heure" />
 *   <BarChart data={[...]} />
 *   <KpiCard label="..." value="..." delta={...} />
 */

// ── SparkLine ─────────────────────────────────────────────────────────────────

export function SparkLine({
  data,
  color = '#00C9A7',
  label,
  height = 40,
  width = 120,
}: {
  data: number[];
  color?: string;
  label?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padX = 4;
  const padY = 4;
  const w = width - padX * 2;
  const h = height - padY * 2;

  const points = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * w;
    const y = padY + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastVal = data[data.length - 1];
  const prevVal = data[data.length - 2];
  const delta = prevVal !== 0 ? ((lastVal - prevVal) / prevVal) * 100 : 0;
  const trend = delta >= 0 ? '↑' : '↓';
  const trendColor = delta >= 0 ? '#00C9A7' : '#FF453A';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill */}
        <polygon
          points={`${padX},${height - padY} ${points} ${width - padX},${height - padY}`}
          fill={`url(#grad-${color.replace('#', '')})`}
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const lastPoint = points.split(' ').pop()?.split(',');
          if (!lastPoint) return null;
          return (
            <circle
              cx={lastPoint[0]}
              cy={lastPoint[1]}
              r="3"
              fill={color}
            />
          );
        })()}
      </svg>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6E6E73' }}>{label}</span>
          <span style={{ fontSize: 11, color: trendColor, fontWeight: 700 }}>
            {trend} {Math.abs(delta).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── BarChart ──────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  color = '#FF9500',
  height = 80,
  showLabels = true,
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  height?: number;
  showLabels?: boolean;
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.floor(100 / data.length);
  const gap = 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: `${gap}px`, height }}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d.value / max) * height);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: barH,
                backgroundColor: color,
                borderRadius: '4px 4px 0 0',
                opacity: 0.7 + (d.value / max) * 0.3,
                transition: 'height 0.3s ease',
                position: 'relative',
              }}
              title={`${d.label}: ${d.value}`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: 'flex', gap: `${gap}px` }}>
          {data.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  delta,
  sparkData,
  color = '#00C9A7',
}: {
  label: string;
  value: string;
  delta?: number;
  sparkData?: number[];
  color?: string;
}) {
  const trendColor = (delta ?? 0) >= 0 ? '#00C9A7' : '#FF453A';
  const trendIcon = (delta ?? 0) >= 0 ? '↑' : '↓';

  return (
    <div
      className="kpi-card"
      style={{
        background: `linear-gradient(160deg, ${color}0e 0%, rgba(8,15,24,0.9) 100%)`,
        border: `1px solid ${color}28`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 18,
        padding: '16px 18px',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 800, color: '#F5F5F7', lineHeight: 1 }}>{value}</p>
        </div>
        {delta !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 700, color: trendColor, background: trendColor + '18', borderRadius: 999, padding: '3px 8px' }}>
            {trendIcon} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {sparkData && sparkData.length > 1 && (
        <SparkLine data={sparkData} color={color} width={160} height={36} />
      )}
    </div>
  );
}

// ── DonutRing ─────────────────────────────────────────────────────────────────

export function DonutRing({
  value,
  total,
  color = '#00C9A7',
  label,
  size = 80,
}: {
  value: number;
  total: number;
  color?: string;
  label?: string;
  size?: number;
}) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth={10} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#F5F5F7',
        }}>
          {Math.round(pct * 100)}%
        </div>
      </div>
      {label && <p style={{ margin: 0, fontSize: 11, color: '#6E6E73', textAlign: 'center' }}>{label}</p>}
    </div>
  );
}
