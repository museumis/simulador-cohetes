/** Dos series con un eje x común. */
export interface SeriesUnidas {
  x: number[];
  a: (number | null)[];
  b: (number | null)[];
}

/** Valor de una serie en x por interpolación lineal; null fuera de su intervalo o junto a un null. */
function interpolarEn(xs: readonly number[], ys: readonly (number | null)[], i: number, x: number): number | null {
  // i: índice del primer punto con xs[i] > x.
  const y0 = ys[i - 1];
  const y1 = ys[i];
  if (i === 0 || i >= xs.length || y0 === null || y0 === undefined || y1 === null || y1 === undefined) return null;
  const x0 = xs[i - 1]!;
  const x1 = xs[i]!;
  return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
}

/**
 * Une dos series ordenadas por x en un solo eje x ascendente, para dibujarlas superpuestas
 * (uPlot necesita un eje x común). En los x de una que no están en la otra, la otra se
 * interpola linealmente; fuera de su intervalo queda null. Un x presente en las dos ocupa una
 * sola fila y los x repetidos dentro de una serie (discontinuidades) se conservan en orden.
 */
export function unirSeries(
  xa: readonly number[],
  ya: readonly (number | null)[],
  xb: readonly number[],
  yb: readonly (number | null)[],
): SeriesUnidas {
  const x: number[] = [];
  const a: (number | null)[] = [];
  const b: (number | null)[] = [];
  let i = 0;
  let j = 0;
  while (i < xa.length || j < xb.length) {
    const sa = xa[i];
    const sb = xb[j];
    if (sb === undefined || (sa !== undefined && sa < sb)) {
      x.push(sa!);
      a.push(ya[i++]!);
      b.push(interpolarEn(xb, yb, j, sa!));
    } else if (sa === undefined || sb < sa) {
      x.push(sb);
      a.push(interpolarEn(xa, ya, i, sb));
      b.push(yb[j++]!);
    } else {
      x.push(sa);
      a.push(ya[i++]!);
      b.push(yb[j++]!);
    }
  }
  return { x, a, b };
}

/**
 * Reduce una serie a como mucho cuatro puntos por intervalo de x (el primero, el mínimo, el
 * máximo y el último, en su orden), para dibujarla sin perder los picos. Los null se descartan.
 * @param intervalos número de intervalos en que se divide [xMin, xMax]; los puntos fuera se descartan
 */
export function diezmar(
  xs: readonly number[],
  ys: readonly (number | null)[],
  xMin: number,
  xMax: number,
  intervalos: number,
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const ancho = (xMax - xMin) / intervalos;
  let actual = -1;
  let primero = -1;
  let minimo = -1;
  let maximo = -1;
  let ultimo = -1;
  const volcar = (): void => {
    if (primero < 0) return;
    const indices = [...new Set([primero, minimo, maximo, ultimo])].sort((p, q) => p - q);
    for (const k of indices) {
      x.push(xs[k]!);
      y.push(ys[k]!);
    }
  };
  for (let k = 0; k < xs.length; k++) {
    const xk = xs[k]!;
    const yk = ys[k];
    if (yk === null || yk === undefined || !Number.isFinite(yk) || xk < xMin || xk > xMax) continue;
    const intervalo = ancho > 0 ? Math.min(Math.floor((xk - xMin) / ancho), intervalos - 1) : 0;
    if (intervalo !== actual) {
      volcar();
      actual = intervalo;
      primero = minimo = maximo = k;
    } else {
      if (yk < ys[minimo]!) minimo = k;
      if (yk > ys[maximo]!) maximo = k;
    }
    ultimo = k;
  }
  volcar();
  return { x, y };
}
