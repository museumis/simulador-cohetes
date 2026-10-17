import { marcasLineales } from '../util/escala';
import { formatearNumero } from '../util/formato';
import { diezmar } from '../util/series';

/** Una serie de una gráfica; la discontinua es la de referencia en una comparación. */
export interface SerieSVG {
  x: readonly number[];
  y: readonly (number | null)[];
  discontinua: boolean;
}

export interface GraficaSVG {
  etiqueta: string; // eje vertical, con su unidad: "h [km]"
  series: readonly SerieSVG[];
  log: boolean;
}

export interface OpcionesSVG {
  titulo: string;
  etiquetaX: string;           // "t [s]"
  xMin: number;
  xMax: number;
  eventos: readonly number[];  // instantes de los eventos (líneas verticales)
  ancho?: number;              // px
  altoGrafica?: number;        // px de cada gráfica
}

/** Décadas que abarca como mucho un eje logarítmico, como en las gráficas de la interfaz. */
const DECADAS_LOG = 15;
const MARGEN_IZQUIERDO = 78;
const MARGEN_DERECHO = 16;
const ALTO_TITULO = 28;
const SEPARACION = 26;       // entre gráficas, para la etiqueta del eje
const ALTO_EJE_X = 40;
const FUENTE = 'font-family="ui-monospace, Consolas, monospace" font-size="11"';

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fijo = (v: number): string => (Math.round(v * 100) / 100).toString();

function rotulo(v: number, cifras = 3): string {
  return v === 0 ? '0' : formatearNumero(v, cifras);
}

/** Tramos contiguos sin null, para no unir con una recta los huecos de la escala logarítmica. */
function tramos(x: readonly number[], y: readonly (number | null)[]): { x: number[]; y: number[] }[] {
  const lista: { x: number[]; y: number[] }[] = [];
  let actual: { x: number[]; y: number[] } | null = null;
  for (let i = 0; i < x.length; i++) {
    const v = y[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      actual = null;
      continue;
    }
    if (!actual) lista.push((actual = { x: [], y: [] }));
    actual.x.push(x[i]!);
    actual.y.push(v);
  }
  return lista;
}

/** Valores que se dibujan: en escala logarítmica, log₁₀ de los positivos a menos de DECADAS_LOG del máximo. */
function valoresDibujo(g: GraficaSVG, xMin: number, xMax: number): { series: (number | null)[][]; min: number; max: number } {
  let maximo = -Infinity;
  for (const s of g.series) {
    s.y.forEach((v, i) => {
      if (v !== null && Number.isFinite(v) && s.x[i]! >= xMin && s.x[i]! <= xMax) maximo = Math.max(maximo, v);
    });
  }
  const umbral = maximo * 10 ** -DECADAS_LOG;
  const series = g.series.map((s) =>
    s.y.map((v) => {
      if (v === null || !Number.isFinite(v)) return null;
      if (!g.log) return v;
      return v > 0 && v >= umbral ? Math.log10(v) : null;
    }),
  );
  let min = Infinity;
  let max = -Infinity;
  series.forEach((ys, k) => {
    const xs = g.series[k]!.x;
    ys.forEach((v, i) => {
      if (v === null || xs[i]! < xMin || xs[i]! > xMax) return;
      min = Math.min(min, v);
      max = Math.max(max, v);
    });
  });
  if (!(max >= min)) return { series, min: 0, max: 1 };
  if (g.log) return { series, min: Math.floor(min), max: Math.ceil(max) === Math.floor(min) ? Math.floor(min) + 1 : Math.ceil(max) };
  if (max === min) return { series, min: min - (Math.abs(min) || 1) * 0.5, max: max + (Math.abs(max) || 1) * 0.5 };
  const margen = (max - min) * 0.04;
  return { series, min: min - margen, max: max + margen };
}

/**
 * Gráficas apiladas con eje x común en un SVG autónomo, en escala de grises sobre fondo blanco:
 * ejes rotulados, rejilla, líneas de los eventos y series continuas o discontinuas.
 * Cada serie se reduce a unos pocos puntos por píxel sin perder los picos.
 */
export function graficasSVG(graficas: readonly GraficaSVG[], o: OpcionesSVG): string {
  const ancho = o.ancho ?? 960;
  const altoGrafica = o.altoGrafica ?? 150;
  const anchoUtil = ancho - MARGEN_IZQUIERDO - MARGEN_DERECHO;
  const alto = ALTO_TITULO + graficas.length * (altoGrafica + SEPARACION) + ALTO_EJE_X;
  const px = (x: number): number => MARGEN_IZQUIERDO + ((x - o.xMin) / (o.xMax - o.xMin)) * anchoUtil;
  const marcasX = marcasLineales(o.xMin, o.xMax, 10);

  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" ${FUENTE}>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${MARGEN_IZQUIERDO}" y="18" fill="#000000" xml:space="preserve" style="white-space: pre">${escapar(o.titulo)}</text>`,
  ];

  graficas.forEach((g, n) => {
    const arriba = ALTO_TITULO + n * (altoGrafica + SEPARACION) + SEPARACION;
    const abajo = arriba + altoGrafica;
    const { series, min, max } = valoresDibujo(g, o.xMin, o.xMax);
    const py = (v: number): number => abajo - ((v - min) / (max - min)) * altoGrafica;

    partes.push(`<g>`, `<text x="${MARGEN_IZQUIERDO}" y="${fijo(arriba - 8)}" fill="#000000">${escapar(g.etiqueta)}</text>`);
    // Rejilla y rótulos del eje vertical.
    let marcasY: number[];
    if (g.log) {
      const decadas = max - min;
      const paso = Math.max(1, Math.ceil(decadas / Math.max(2, Math.floor(altoGrafica / 24))));
      marcasY = [];
      for (let d = Math.ceil(min / paso) * paso; d <= max; d += paso) marcasY.push(d);
    } else {
      marcasY = marcasLineales(min, max, Math.max(2, Math.floor(altoGrafica / 30)));
    }
    for (const v of marcasY) {
      const y = fijo(py(v));
      partes.push(
        `<line x1="${MARGEN_IZQUIERDO}" y1="${y}" x2="${MARGEN_IZQUIERDO + anchoUtil}" y2="${y}" stroke="#e0e0e0" stroke-width="1"/>`,
        `<text x="${MARGEN_IZQUIERDO - 6}" y="${fijo(py(v) + 4)}" text-anchor="end" fill="#000000">${escapar(g.log ? rotulo(10 ** v, 1) : rotulo(v))}</text>`,
      );
    }
    for (const x of marcasX) {
      const xx = fijo(px(x));
      partes.push(`<line x1="${xx}" y1="${arriba}" x2="${xx}" y2="${abajo}" stroke="#e0e0e0" stroke-width="1"/>`);
    }
    for (const t of o.eventos) {
      if (t < o.xMin || t > o.xMax) continue;
      const xx = fijo(px(t));
      partes.push(`<line x1="${xx}" y1="${arriba}" x2="${xx}" y2="${abajo}" stroke="#888888" stroke-width="1" stroke-dasharray="2 3"/>`);
    }
    partes.push(`<rect x="${MARGEN_IZQUIERDO}" y="${arriba}" width="${anchoUtil}" height="${altoGrafica}" fill="none" stroke="#000000" stroke-width="1"/>`);

    // Series recortadas al área de la gráfica.
    const recorte = `recorte-${n}`;
    partes.push(
      `<clipPath id="${recorte}"><rect x="${MARGEN_IZQUIERDO}" y="${arriba}" width="${anchoUtil}" height="${altoGrafica}"/></clipPath>`,
    );
    series.forEach((ys, k) => {
      const s = g.series[k]!;
      const discontinua = s.discontinua ? ' stroke-dasharray="5 3"' : '';
      for (const tramo of tramos(s.x, ys)) {
        const { x, y } = diezmar(tramo.x, tramo.y, o.xMin, o.xMax, anchoUtil);
        if (x.length === 0) continue;
        const puntos = x.map((xi, i) => `${fijo(px(xi))},${fijo(py(y[i]!))}`).join(' ');
        partes.push(
          `<polyline points="${puntos}" fill="none" stroke="#000000" stroke-width="1"${discontinua} clip-path="url(#${recorte})"/>`,
        );
      }
    });
    partes.push(`</g>`);
  });

  // Eje x común, debajo de la última gráfica.
  const base = ALTO_TITULO + graficas.length * (altoGrafica + SEPARACION);
  for (const x of marcasX) {
    const xx = fijo(px(x));
    partes.push(
      `<line x1="${xx}" y1="${base}" x2="${xx}" y2="${base + 4}" stroke="#000000" stroke-width="1"/>`,
      `<text x="${xx}" y="${base + 16}" text-anchor="middle" fill="#000000">${escapar(rotulo(x))}</text>`,
    );
  }
  partes.push(
    `<text x="${fijo(MARGEN_IZQUIERDO + anchoUtil / 2)}" y="${base + 32}" text-anchor="middle" fill="#000000">${escapar(o.etiquetaX)}</text>`,
    `</svg>`,
  );
  return partes.join('\n');
}
