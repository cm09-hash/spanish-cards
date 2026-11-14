/**
 * Small charts, drawn by hand as SVG. No chart library: they work offline,
 * add almost nothing to the download, and take their colours from styles.css,
 * so they follow dark mode by themselves.
 */
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';

/** Creates one SVG element. */
function svg(
  tag: string,
  attributes: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElement {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}

export interface Bar {
  value: number;
  /** Read out by screen readers and shown when a bar is pressed and held, e.g. "Nov 14: 23 reviews". */
  title: string;
  /** Drawn in the accent colour (used for today). */
  highlight?: boolean;
}

export interface BarChartOptions {
  /** One sentence describing the chart, for screen readers. */
  description: string;
  /** Labels under the chart, spread from left to right, e.g. ["Oct 16", "Today"]. */
  axis: string[];
  /** Write each bar's number above it (only sensible for a handful of bars). */
  showValues?: boolean;
}

/** A bar chart: one bar per value, scaled so the tallest fills the height. */
export function barChart(bars: Bar[], options: BarChartOptions): HTMLElement {
  const width = 320;
  const height = 120;
  const top = options.showValues ? 16 : 6;
  const bottom = height - 2;
  const tallest = Math.max(1, ...bars.map((bar) => bar.value));
  const band = width / bars.length;
  const barWidth = Math.max(2, band * 0.68);

  const chart = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': options.description,
    class: 'chart-svg',
  });
  // A faint line at the top value, so the scale can be read.
  chart.append(svg('line', { x1: 0, x2: width, y1: top, y2: top, class: 'chart-grid' }));
  chart.append(svg('line', { x1: 0, x2: width, y1: bottom, y2: bottom, class: 'chart-base' }));

  bars.forEach((bar, index) => {
    const barHeight = (bar.value / tallest) * (bottom - top);
    const x = index * band + (band - barWidth) / 2;
    if (bar.value > 0) {
      chart.append(
        svg(
          'rect',
          {
            x,
            y: bottom - barHeight,
            width: barWidth,
            height: barHeight,
            rx: Math.min(3, barWidth / 2),
            class: `chart-bar ${bar.highlight ? 'is-highlight' : ''}`,
            style: `animation-delay: ${Math.round((index / bars.length) * 260)}ms`,
          },
          svg('title', {}, bar.title),
        ),
      );
    }
    if (options.showValues && bar.value > 0) {
      chart.append(
        svg('text', { x: x + barWidth / 2, y: bottom - barHeight - 4, class: 'chart-value' }, String(bar.value)),
      );
    }
  });

  return h(
    'figure',
    { class: 'chart' },
    chart,
    h(
      'figcaption',
      { class: 'chart-axis' },
      options.axis.map((label) => h('span', null, label)),
    ),
  );
}

export interface LinePoint {
  /** How far along the chart, from 0 (left edge) to 1 (right edge). */
  position: number;
  value: number;
}

/**
 * A rising line with the area under it filled in. Drawn in steps, because the
 * value (cards learned) only ever jumps up on particular days.
 */
export function lineChart(points: LinePoint[], options: { description: string; axis: string[] }): HTMLElement {
  const width = 320;
  const height = 120;
  const top = 8;
  const bottom = height - 2;
  const highest = Math.max(1, ...points.map((point) => point.value));
  const x = (point: LinePoint) => point.position * width;
  const y = (point: LinePoint) => bottom - (point.value / highest) * (bottom - top);

  // Start on the baseline, step up at each point, and run level to the right edge.
  let line = `M0 ${bottom}`;
  let level = bottom;
  for (const point of points) {
    line += ` L${x(point).toFixed(1)} ${level.toFixed(1)} L${x(point).toFixed(1)} ${y(point).toFixed(1)}`;
    level = y(point);
  }
  line += ` L${width} ${level.toFixed(1)}`;

  const chart = svg(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': options.description, class: 'chart-svg' },
    svg('line', { x1: 0, x2: width, y1: top, y2: top, class: 'chart-grid' }),
    svg('path', { d: `${line} L${width} ${bottom} Z`, class: 'chart-area' }),
    svg('path', { d: line, class: 'chart-line' }),
    svg('line', { x1: 0, x2: width, y1: bottom, y2: bottom, class: 'chart-base' }),
  );
  return h(
    'figure',
    { class: 'chart' },
    chart,
    h(
      'figcaption',
      { class: 'chart-axis' },
      options.axis.map((label) => h('span', null, label)),
    ),
  );
}

export interface Segment {
  label: string;
  value: number;
  /** Chooses the colour: see the .tone-… rules in styles.css. */
  tone: string;
}

/** One horizontal bar split into coloured parts, with a list underneath saying what each part is. */
export function stackedBar(segments: Segment[], description: string): HTMLElement {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return h(
    'div',
    { class: 'stacked' },
    h(
      'div',
      { class: 'stacked-bar', role: 'img', 'aria-label': description },
      total === 0
        ? h('span', { class: 'stacked-part tone-empty', style: 'flex-grow: 1' })
        : segments
            .filter((segment) => segment.value > 0)
            .map((segment) =>
              h('span', { class: `stacked-part tone-${segment.tone}`, style: `flex-grow: ${segment.value}` }),
            ),
    ),
    h(
      'ul',
      { class: 'legend' },
      segments.map((segment) =>
        h(
          'li',
          null,
          h('span', { class: `legend-dot tone-${segment.tone}` }),
          `${segment.label} `,
          h('strong', null, segment.value),
        ),
      ),
    ),
  );
}

/** A bar filled to a fraction (0 to 1) of its width, for showing a percentage. */
export function meter(fraction: number | null, tone: string): HTMLElement {
  const width = fraction === null ? 0 : Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return h('div', { class: 'meter' }, h('div', { class: `meter-fill tone-${tone}`, style: `width: ${width}%` }));
}

/** A ring that fills up clockwise as `fraction` goes from 0 to 1, with something in its middle. */
export function ring(fraction: number, middle: string, description: string): HTMLElement {
  const radius = 26;
  const around = 2 * Math.PI * radius;
  const filled = Math.min(1, Math.max(0, fraction)) * around;
  const drawing = svg(
    'svg',
    { viewBox: '0 0 64 64', role: 'img', 'aria-label': description, class: 'ring-svg' },
    svg('circle', { cx: 32, cy: 32, r: radius, class: 'ring-track' }),
    svg('circle', {
      cx: 32,
      cy: 32,
      r: radius,
      class: `ring-fill ${fraction >= 1 ? 'is-full' : ''}`,
      'stroke-dasharray': `${filled.toFixed(1)} ${around.toFixed(1)}`,
      transform: 'rotate(-90 32 32)',
    }),
  );
  return h('div', { class: 'ring' }, drawing, h('span', { class: 'ring-middle' }, middle));
}
