import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WritingTask } from '@ielts/shared';

const colours = ['#246891', '#ad4a36', '#2b7758', '#815aa4', '#ab7316', '#596771'];

function draw(canvas: HTMLCanvasElement, data: NonNullable<WritingTask['dataTable']>, kind: NonNullable<WritingTask['visualKind']>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (kind === 'pie') {
    const total = data.rows.reduce((sum, row) => sum + row.values[0]!, 0);
    if (total <= 0) return;
    let start = -Math.PI / 2;
    data.rows.forEach((row, index) => {
      const portion = row.values[0]! / total;
      const end = start + portion * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(380, 154);
      ctx.arc(380, 154, 131, start, end);
      ctx.closePath();
      ctx.fillStyle = colours[index % colours.length]!;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fbfaf7';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      const midpoint = (start + end) / 2;
      ctx.fillText(`${row.values[0]}%`, 380 + Math.cos(midpoint) * 89, 160 + Math.sin(midpoint) * 89);
      start = end;
    });
    return;
  }

  const max = Math.max(0, ...data.rows.flatMap((row) => row.values));
  const min = Math.min(0, ...data.rows.flatMap((row) => row.values));
  const rawStep = (max - min || 1) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rawStep) ?? 10) * magnitude;
  const top = Math.ceil(max / step) * step || step;
  const bottom = Math.floor(min / step) * step;
  const y = (n: number) => 256 - (n - bottom) / (top - bottom) * 205;
  const gap = 625 / data.columns.length;
  const x = (index: number) => 100 + gap * (index + 0.5);
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'right';
  for (let tick = bottom; tick <= top + step / 4; tick += step) {
    ctx.strokeStyle = tick === 0 ? '#5e6870' : '#d6dcd9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, y(tick));
    ctx.lineTo(725, y(tick));
    ctx.stroke();
    ctx.fillStyle = '#243442';
    ctx.fillText(String(Number(tick.toPrecision(6))), 88, y(tick) + 5, 66);
  }
  ctx.textAlign = 'left';
  ctx.fillText(data.unit, 100, 28, 620);
  ctx.textAlign = 'center';
  data.columns.forEach((column, index) => ctx.fillText(column, x(index), 285, gap - 8));
  data.rows.forEach((row, index) => {
    const colour = colours[index % colours.length]!;
    ctx.fillStyle = colour;
    if (kind === 'bar') {
      const width = gap * 0.7 / data.rows.length;
      row.values.forEach((n, valueIndex) => {
        ctx.fillRect(x(valueIndex) + (index - data.rows.length / 2) * width, Math.min(y(0), y(n)), width - 2, Math.abs(y(n) - y(0)));
      });
      return;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.beginPath();
    row.values.forEach((n, valueIndex) => {
      if (valueIndex === 0) ctx.moveTo(x(valueIndex), y(n));
      else ctx.lineTo(x(valueIndex), y(n));
    });
    ctx.stroke();
    row.values.forEach((n, valueIndex) => {
      ctx.beginPath();
      ctx.arc(x(valueIndex), y(n), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  });
}

export function WritingVisual({ task }: { task: WritingTask }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const { diagram, visualKind, dataTable } = task;

  useEffect(() => {
    if (canvas.current && visualKind && dataTable) draw(canvas.current, dataTable, visualKind);
  }, [visualKind, dataTable]);

  if (diagram) {
    return (
      <div className="mt-4 grid gap-3">
        {diagram.panels.map((panel) => (
          <figure key={panel.title} className="rounded-sm border border-line bg-paper p-3">
            <figcaption className="mb-3 font-semibold text-ink">{panel.title}</figcaption>
            {diagram.kind === 'map' ? (
              <div className="relative min-h-40 rounded-sm border border-dashed border-line bg-surface" role="img"
                aria-label={panel.items.map(({ label, detail }) => `${label}: ${detail}`).join('; ')}>
                <span className="absolute right-2 top-1 text-xs text-muted" aria-hidden="true">↑ N</span>
                {panel.items.map(({ label, position }) => <span aria-hidden="true" key={label}
                  style={{ left: `${position?.[0] ?? 50}%`, top: `${position?.[1] ?? 50}%` }}
                  className="absolute max-w-[31%] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-brand-500 bg-surface px-1.5 py-1 text-center text-[10px] font-semibold text-ink sm:text-xs">{label}</span>)}
              </div>
            ) : (
              <ol className="grid gap-2">
                {panel.items.map(({ label, detail }, index) => <li key={label}>
                  {index > 0 ? <span className="block text-center text-brand-600" aria-hidden="true">↓</span> : null}
                  <div className="rounded-sm border border-line bg-surface p-2 text-sm"><strong>{label}</strong><p className="text-muted">{detail}</p></div>
                </li>)}
              </ol>
            )}
          </figure>
        ))}
      </div>
    );
  }
  if (!visualKind || !dataTable) return null;

  return (
    <figure className="mt-4 rounded-sm border border-line bg-paper p-2">
      <div className="overflow-x-auto">
        <canvas ref={canvas} width="760" height="310" className="w-full min-w-[420px]"
          role="img" aria-label={t(`writing.visual-${visualKind}`)} />
      </div>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 p-2 text-xs text-ink">
        {dataTable.rows.map(({ label }, index) => <li key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colours[index % colours.length] }} aria-hidden="true" />{label}
        </li>)}
      </ul>
    </figure>
  );
}
